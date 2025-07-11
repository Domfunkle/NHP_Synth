// Includes
#include <stdio.h>
#include <math.h>
#include <string.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "driver/uart.h"
#include "driver/gpio.h"
#include "esp_task_wdt.h"
#include "driver/dac_oneshot.h"

// Macros and Constants
#define TABLE_SIZE (1 << 16)
#define MIN_FREQ 20
#define MAX_FREQ 8000
#define UART_NUM UART_NUM_0
#define UART_RX_BUF_SIZE 256
#define SQUARE_WAVE_OUTPUT 18  // GPIO for square wave output
#define SQUARE_WAVE_INPUT 19
#define SQUARE_WAVE_HZ 50
#define PERIOD_US 50         // period in microseconds for DDS output
#define AMPL_RAMP_STEP 5e-5 // Adjust for ramp speed (smaller = slower)

// Static Variables
static const char *TAG = "dac_oneshot_test";
static uint8_t waveform_quarter_table[TABLE_SIZE / 4]; // Store only a quarter of the waveform table to save memory

// Per-channel frequency, phase, amplitude, harmonic
static volatile float current_freq[2] = {50, 50}; // [A, B]
static volatile float current_phase[2] = {0, 0};
static volatile float current_ampl[2] = {0.0f, 0.0f}; // Used for output (ramped)
static volatile float target_ampl[2] = {1.0f, 0.5f}; // Set by UART, ramped to
static volatile int harmonic_order[2] = {0, 0}; // 0 = none, 3 = 3rd, 5 = 5th, etc.
static volatile int harmonic_percent[2] = {0, 0}; // 0 to 100
static volatile float harmonic_phase[2] = {0.0f, 0.0f}; // phase in radians

static volatile uint32_t dds_acc[2] = {0, 0};
static volatile uint32_t dds_step[2] = {1, 1};
static volatile uint32_t dds_phase_offset[2] = {0, 0};
static volatile uint32_t sqw_acc = 0; // Accumulator for square wave generation
static volatile int sqw_output_state = 0;
static volatile int sqw_period_ticks = 0;
static volatile bool sqw_initialized = false;

// High-resolution timer handle
typedef struct {
    esp_timer_handle_t handle;
    int64_t period_us;
} highres_timer_t;

static highres_timer_t dds_timer = {0};

// DDS configuration structure
typedef struct {
    dac_oneshot_handle_t dac_handle[2];
    dac_oneshot_config_t dac_cfg[2];
} dds_config_t;

static dds_config_t dds_cfg = {
    .dac_handle = {NULL, NULL},
    .dac_cfg = {
        { .chan_id = DAC_CHAN_0 }, // GPIO25 (A)
        { .chan_id = DAC_CHAN_1 }  // GPIO26 (B)
    },
};

// Global GPIO config for square wave output
static gpio_config_t square_wave_OUTPUT_conf = {
    .pin_bit_mask = (1ULL << SQUARE_WAVE_OUTPUT),
    .mode = GPIO_MODE_OUTPUT,
    .pull_up_en = GPIO_PULLUP_DISABLE,
    .pull_down_en = GPIO_PULLDOWN_DISABLE,
    .intr_type = GPIO_INTR_DISABLE
};
// Global GPIO config for input on GPIO19 with pull-down and rising edge interrupt
#define GPIO_INPUT_PIN SQUARE_WAVE_INPUT
static gpio_config_t input_gpio_conf = {
    .pin_bit_mask = (1ULL << GPIO_INPUT_PIN),
    .mode = GPIO_MODE_INPUT,
    .pull_up_en = GPIO_PULLUP_DISABLE,
    .pull_down_en = GPIO_PULLDOWN_ENABLE,
    .intr_type = GPIO_INTR_POSEDGE
};

// Function Declarations
static void generate_waveform(int table_size);
static void update_dds_step(int ch, float frequency, float period_us);
static void uart_cmd_task(void *arg);
static void dds_output(void);
static void dds_timer_callback(void* arg);
static void start_dds_timer(int64_t period_us);
static void global_gpio_init(void);
static void pause_dds_timer(void);
static void resume_dds_timer(void);

// Function Definitions
static void generate_waveform(int table_size) {
    int quarter = table_size / 4;
    for (int i = 0; i < quarter; i++) {
        float phase_val = (M_PI_2 * i) / (float)quarter; // 0 to pi/2
        float val = cosf(phase_val);
        uint8_t value = (uint8_t)((val * 127.5f) + 127.5f); // 0-255 range
        waveform_quarter_table[i] = value;
    }
}
// Helper to reconstruct full cosine using quarter table and symmetry
static inline uint8_t get_waveform_value(uint32_t idx) {
    uint32_t quarter = TABLE_SIZE / 4;
    idx = idx % TABLE_SIZE;
    if (idx < quarter) {
        // 0 to pi/2: +cos
        return waveform_quarter_table[idx];
    } else if (idx < 2 * quarter) {
        // pi/2 to pi: +cos (mirrored)
        return 255 - waveform_quarter_table[quarter - 1 - (idx - quarter)];
    } else if (idx < 3 * quarter) {
        // pi to 3pi/2: -cos
        return 255 - waveform_quarter_table[idx - 2 * quarter];
    } else {
        // 3pi/2 to 2pi: -cos (mirrored)
        return waveform_quarter_table[quarter - 1 - (idx - 3 * quarter)];
    }
}

static void update_dds_step(int ch, float frequency, float period_us) {
    dds_step[ch] = (TABLE_SIZE * frequency * period_us / 1000000);
    dds_phase_offset[ch] = (uint32_t)(current_phase[ch] * TABLE_SIZE / (2.0f * M_PI));
    // ESP_LOGI(TAG, "DDS step and phase offset updated for channel %d: step %lu, phase offset %lu for frequency %.2f Hz", 
    //          ch, dds_step[ch], dds_phase_offset[ch], frequency);
}

static void uart_cmd_task(void *arg) {
    uart_config_t uart_config = {
        .baud_rate = 115200,
        .data_bits = UART_DATA_8_BITS,
        .parity    = UART_PARITY_DISABLE,
        .stop_bits = UART_STOP_BITS_1,
        .flow_ctrl = UART_HW_FLOWCTRL_DISABLE
    };
    esp_err_t err = uart_driver_install(UART_NUM, UART_RX_BUF_SIZE, 0, 0, NULL, 0);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "uart_driver_install failed: %d", err);
        vTaskDelete(NULL);
    }
    uart_param_config(UART_NUM, &uart_config);
    uart_set_pin(UART_NUM, UART_PIN_NO_CHANGE, UART_PIN_NO_CHANGE, UART_PIN_NO_CHANGE, UART_PIN_NO_CHANGE);
    ESP_LOGI(TAG, "UART command task started. Type 'help' for usage.");
    char cmd_buf[32];
    int cmd_pos = 0;
    while (1) {
        uint8_t ch;
        int len = uart_read_bytes(UART_NUM, &ch, 1, pdMS_TO_TICKS(100));
        if (len > 0) {
            if (ch == '\r' || ch == '\n') {
                cmd_buf[cmd_pos] = '\0';
                // Unified frequency command: wfa / wfb
                if (strncmp(cmd_buf, "wf", 2) == 0 && (cmd_buf[2] == 'a' || cmd_buf[2] == 'b')) {
                    int ch_idx = (cmd_buf[2] == 'a') ? 0 : 1;
                    float freq = strtof(cmd_buf + 3, NULL);
                    if (freq >= MIN_FREQ && freq <= MAX_FREQ) {
                        current_freq[ch_idx] = freq;
                        update_dds_step(ch_idx, current_freq[ch_idx], PERIOD_US);
                        // ESP_LOGI(TAG, "UART: Set channel %c frequency to %f Hz", ch_idx == 0 ? 'A' : 'B', freq);
                    } else {
                        ESP_LOGW(TAG, "UART: Invalid channel %c frequency: %f (Allowed: %d-%d)", ch_idx == 0 ? 'A' : 'B', freq, MIN_FREQ, MAX_FREQ);
                    }
                // Unified phase command: wpa / wpb
                } else if (strncmp(cmd_buf, "wp", 2) == 0 && (cmd_buf[2] == 'a' || cmd_buf[2] == 'b')) {
                    int ch_idx = (cmd_buf[2] == 'a') ? 0 : 1;
                    float phase = strtof(cmd_buf + 3, NULL);
                    if (phase < -180.0f || phase > 180.0f) {
                        ESP_LOGW(TAG, "UART: Invalid channel %c phase: %f (Allowed: -180 to +180)", ch_idx == 0 ? 'A' : 'B', phase);
                    }
                    if (phase < -180.0f) phase = -180.0f;
                    if (phase > 180.0f) phase = 180.0f;
                    current_phase[ch_idx] = phase * (float)M_PI / 180.0f;
                    // ESP_LOGI(TAG, "UART: Set channel %c phase to %f degrees (%.2f radians)", ch_idx == 0 ? 'A' : 'B', phase, current_phase[ch_idx]);
                // Unified amplitude command: waa / wab
                } else if (strncmp(cmd_buf, "wa", 2) == 0 && (cmd_buf[2] == 'a' || cmd_buf[2] == 'b')) {
                    int ch_idx = (cmd_buf[2] == 'a') ? 0 : 1;
                    float ampl = strtof(cmd_buf + 3, NULL);
                    if (ampl < 0.0f) ampl = 0.0f;
                    if (ampl > 100.0f) ampl = 100.0f;
                    target_ampl[ch_idx] = ampl / 100.0f;
                    // ESP_LOGI(TAG, "UART: Set channel %c amplitude to %.2f (0-100, scaled to 0.0-1.0)", ch_idx == 0 ? 'A' : 'B', ampl);
                // Unified harmonic injection: wha / whb
                } else if (strncmp(cmd_buf, "wh", 2) == 0 && (cmd_buf[2] == 'a' || cmd_buf[2] == 'b')) {
                    int ch = (cmd_buf[2] == 'a') ? 0 : 1;
                    int order = 0;
                    float percent = 0.0f;
                    float phase_deg = 0.0f;
                    char *comma = strchr(cmd_buf + 3, ',');
                    if (comma) {
                        order = strtol(cmd_buf + 3, NULL, 10);
                        percent = strtof(comma + 1, NULL);
                        char *comma2 = strchr(comma + 1, ',');
                        if (comma2) {
                            phase_deg = strtof(comma2 + 1, NULL);
                        }
                        if (order < 3 || (order % 2) == 0) {
                            ESP_LOGW(TAG, "UART: Harmonic order must be odd and >= 3");
                        } else if (percent < 0.0f || percent > 100.0f) {
                            ESP_LOGW(TAG, "UART: Harmonic percent must be 0-100");
                        } else {
                            harmonic_order[ch] = order;
                            harmonic_percent[ch] = percent;
                            harmonic_phase[ch] = phase_deg * (float)M_PI / 180.0f;
                            // ESP_LOGI(TAG, "UART: Channel %c: Mix in %d-th harmonic at %.1f%%, phase %.1f deg (table regenerated)", ch == 0 ? 'A' : 'B', order, percent, phase_deg);
                        }
                    } else {
                        ESP_LOGW(TAG, "UART: Invalid harmonic command format. Use e.g. wha3,10 or wha3,10,-90");
                    }
                } else if (strcmp(cmd_buf, "help") == 0) {
                    const char *help_msg =
                        "Commands:\r\n"
                        "  wf[a|b]<freq>   Set channel A or B frequency in Hz (e.g. wfa1000, wfb1000)\r\n"
                        "  wp[a|b]<deg>    Set channel A or B phase in degrees (e.g. wpa90, wpb-90, range -180 to +180)\r\n"
                        "  wa[a|b]<ampl>   Set channel A or B amplitude (0-100, e.g. waa50, wab80)\r\n"
                        "  wh[a|b]<order>,<pct>[,<phase>] Mix odd harmonic to channel A or B (e.g. wha3,10 or whb5,20,45)\r\n"
                        "  help            Show this help message\r\n";
                    uart_write_bytes(UART_NUM, help_msg, strlen(help_msg));   
                } else if (cmd_pos > 0) {
                    ESP_LOGW(TAG, "UART: Unknown command: '%s'", cmd_buf);
                }
                cmd_pos = 0;
            } else if (cmd_pos < (int)sizeof(cmd_buf) - 1) {
                cmd_buf[cmd_pos++] = ch;
            }
        }
    }
}

// Output one DDS sample for both channels
static void dds_output(void) {
    // Initialize DAC channels if needed
    for (int ch = 0; ch < 2; ++ch) {
        if (dds_cfg.dac_handle[ch] == NULL) {
            ESP_ERROR_CHECK(dac_oneshot_new_channel(&dds_cfg.dac_cfg[ch], &dds_cfg.dac_handle[ch]));
        }
    }

    // --- Square wave generation using DDS timer ---
    if (!sqw_initialized) {
        // Calculate how many DDS timer periods per half square wave period
        sqw_period_ticks = (int)((1000000.0 / (2 * SQUARE_WAVE_HZ)) / PERIOD_US);
        sqw_acc = 0;
        sqw_output_state = 0;
        sqw_initialized = true;
        gpio_set_level(SQUARE_WAVE_OUTPUT, sqw_output_state);
    }
    if (sqw_acc >= sqw_period_ticks) {
        sqw_output_state = !sqw_output_state;
        gpio_set_level(SQUARE_WAVE_OUTPUT, sqw_output_state);
        if (sqw_output_state == 1) {
            dds_acc[0] = dds_phase_offset[0];
            dds_acc[1] = dds_phase_offset[1];
        }
        sqw_acc = 0;
    }
    sqw_acc++;
    // --- End square wave generation ---

    uint8_t values[2];
    for (int ch = 0; ch < 2; ++ch) {
        // Amplitude ramping. If the current amplitude is significantly different from the target amplitude, adjust it gradually per tick
        if (fabsf(current_ampl[ch] - target_ampl[ch]) > AMPL_RAMP_STEP) {
            if (current_ampl[ch] < target_ampl[ch])
                current_ampl[ch] += AMPL_RAMP_STEP;
            else
                current_ampl[ch] -= AMPL_RAMP_STEP;
        } else {
            current_ampl[ch] = target_ampl[ch];
        }

        // Phase accumulator for this sample
        uint32_t phase_acc = (dds_acc[ch] + (uint32_t)(current_phase[ch] * (TABLE_SIZE / (2.0f * M_PI)))) % TABLE_SIZE;
        // Use helper to get base waveform value
        float base_val = ((float)get_waveform_value(phase_acc) - 127.5f) / 127.5f; // -1.0 to 1.0
        float val = base_val;
        // Harmonic mixing on the fly
        if (harmonic_order[ch] >= 3 && (harmonic_order[ch] % 2) == 1 && harmonic_percent[ch] > 0) {
            float harmonic_percent_scaled = harmonic_percent[ch] / 100.0f;
            int harmonic_order_val = harmonic_order[ch];
            float harmonic_phase_offset = harmonic_phase[ch];
            uint32_t harmonic_phase_acc = (harmonic_order_val * phase_acc + (uint32_t)(harmonic_phase_offset * (TABLE_SIZE / (2.0f * M_PI)))) % TABLE_SIZE;
            float harmonic_val = ((float)get_waveform_value(harmonic_phase_acc) - 127.5f) / 127.5f;
            val = val * (1.0f - harmonic_percent_scaled) + harmonic_percent_scaled * harmonic_val;
        }
        // Convert to 0-255 and apply amplitude
        uint8_t value = (uint8_t)(((val * 127.5f) + 127.5f) * current_ampl[ch]);
        values[ch] = value;
    }

    // Output to DACs immediately one after the other
    ESP_ERROR_CHECK(dac_oneshot_output_voltage(dds_cfg.dac_handle[0], values[0]));
    ESP_ERROR_CHECK(dac_oneshot_output_voltage(dds_cfg.dac_handle[1], values[1]));

    for (int ch = 0; ch < 2; ++ch) {
        dds_acc[ch] += dds_step[ch];
        if (dds_acc[ch] >= TABLE_SIZE) dds_acc[ch] -= TABLE_SIZE;
    }
}

// Create and start the high-resolution timer for the DDS output
static void start_dds_timer(int64_t period_us) {
    if (dds_timer.handle) {
        esp_timer_stop(dds_timer.handle);
        esp_timer_delete(dds_timer.handle);
        dds_timer.handle = NULL;
    }
    const esp_timer_create_args_t timer_args = {
        .callback = &dds_timer_callback,
        .arg = NULL,
        .dispatch_method = ESP_TIMER_TASK,
        .name = "dds_timer"
    };
    ESP_ERROR_CHECK(esp_timer_create(&timer_args, &dds_timer.handle));
    ESP_ERROR_CHECK(esp_timer_start_periodic(dds_timer.handle, period_us));
    dds_timer.period_us = period_us;
}

// Timer callback (to be implemented as needed)
static void dds_timer_callback(void* arg) {
    // Place DDS output logic here if needed
    dds_output();
}

// ISR handler for GPIO19 rising edge
static void IRAM_ATTR sqw_isr_handler(void* arg) {
    sqw_acc = 0; // Reset square wave accumulator on GPIO19 event
    sqw_output_state = 1;
    gpio_set_level(SQUARE_WAVE_OUTPUT, sqw_output_state);
    dds_acc[0] = dds_phase_offset[0];
    dds_acc[1] = dds_phase_offset[1];
}

static void global_gpio_init(void) {
    gpio_config(&square_wave_OUTPUT_conf);
    gpio_config(&input_gpio_conf);
    gpio_install_isr_service(0);
    gpio_isr_handler_add(GPIO_INPUT_PIN, sqw_isr_handler, NULL);
    gpio_set_intr_type(GPIO_INPUT_PIN, GPIO_INTR_POSEDGE);
}

static void pause_dds_timer(void) {
    if (dds_timer.handle) {
        esp_timer_stop(dds_timer.handle);
    }
}

static void resume_dds_timer(void) {
    if (dds_timer.handle) {
        esp_timer_start_periodic(dds_timer.handle, dds_timer.period_us);
    }
}

void app_main(void) {
    generate_waveform(TABLE_SIZE);
    update_dds_step(0, current_freq[0], PERIOD_US);
    update_dds_step(1, current_freq[1], PERIOD_US);
    
    global_gpio_init();
    // ESP_LOGI(TAG, "Starting DAC DDS generator. Type 'help' in UART for usage. Frequency range: %d-%d Hz.", MIN_FREQ, MAX_FREQ);
    xTaskCreatePinnedToCore(uart_cmd_task, "uart_cmd_task", 4096, NULL, 5, NULL, 0);
    start_dds_timer(PERIOD_US);
}
