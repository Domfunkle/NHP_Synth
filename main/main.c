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
// Per-channel frequency, phase, and amplitude
static volatile float current_freq[2] = {50, 50}; // [A, B]
static volatile float current_phase[2] = {0, 0};
static volatile float current_ampl[2] = {0.0f, 0.0f}; // Used for output (ramped)
static volatile float target_ampl[2] = {1.0f, 0.5f}; // Set by UART, ramped to

// Per-channel harmonic mixing
static volatile int harmonic_order[2] = {0, 0}; // 0 = none, 3 = 3rd, 5 = 5th, etc.
static volatile float harmonic_percent[2] = {0.0f, 0.0f}; // 0.0 to 1.0
static volatile float harmonic_phase[2] = {0.0f, 0.0f}; // phase in radians
// Per-channel cosine tables for harmonic mixing
static uint8_t cosine_table[2][TABLE_SIZE];

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
static void generate_cosine_table(int ch, int table_size);
static void update_dds_step(int ch, float frequency, float period_us);
static void uart_cmd_task(void *arg);
static void dds_output(void);
static void dds_timer_callback(void* arg);
static void start_dds_timer(int64_t period_us);
static void global_gpio_init(void);
static void pause_dds_timer(void);
static void resume_dds_timer(void);

// Function Definitions
static void generate_cosine_table(int ch, int table_size) {
    for (int i = 0; i < table_size; i++) {
        float phase_val = 2.0f * M_PI * i / (float)table_size; // full cycle
        float val = cosf(phase_val);
        if (harmonic_order[ch] >= 3 && (harmonic_order[ch] % 2) == 1 && harmonic_percent[ch] > 0.0f) {
            val = val * (1.0f - harmonic_percent[ch]) + harmonic_percent[ch] * cosf(harmonic_order[ch] * phase_val + harmonic_phase[ch]);
        }
        uint8_t value = (uint8_t)((val * 127.5f) + 127.5f); // 0-255 range
        cosine_table[ch][i] = value;
    }
}

static void update_dds_step(int ch, float frequency, float period_us) {
    dds_step[ch] = (TABLE_SIZE * frequency * period_us / 1000000);
    dds_phase_offset[ch] = (uint32_t)(current_phase[ch] * TABLE_SIZE / (2.0f * M_PI));
    ESP_LOGI(TAG, "DDS step and phase offset updated for channel %d: step %lu, phase offset %lu for frequency %.2f Hz", 
             ch, dds_step[ch], dds_phase_offset[ch], frequency);
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
                // Frequency commands
                if (strncmp(cmd_buf, "wfa", 3) == 0) {
                    float freq = strtof(cmd_buf + 3, NULL);
                    if (freq >= MIN_FREQ && freq <= MAX_FREQ) {
                        current_freq[0] = freq;
                        update_dds_step(0, current_freq[0], PERIOD_US);
                        ESP_LOGI(TAG, "UART: Set channel A frequency to %f Hz", freq);
                    } else {
                        ESP_LOGW(TAG, "UART: Invalid channel A frequency: %f (Allowed: %d-%d)", freq, MIN_FREQ, MAX_FREQ);
                    }
                } else if (strncmp(cmd_buf, "wfb", 3) == 0) {
                    float freq = strtof(cmd_buf + 3, NULL);
                    if (freq >= MIN_FREQ && freq <= MAX_FREQ) {
                        current_freq[1] = freq;
                        update_dds_step(1, current_freq[1], PERIOD_US);
                        ESP_LOGI(TAG, "UART: Set channel B frequency to %f Hz", freq);
                    } else {
                        ESP_LOGW(TAG, "UART: Invalid channel B frequency: %f (Allowed: %d-%d)", freq, MIN_FREQ, MAX_FREQ);
                    }
                } else if (strncmp(cmd_buf, "wpa", 3) == 0) {
                    float phase = strtof(cmd_buf + 3, NULL);
                    if (phase < -180.0f || phase > 180.0f) {
                        ESP_LOGW(TAG, "UART: Invalid channel A phase: %f (Allowed: -180 to +180)", phase);
                    }
                    if (phase < -180.0f) phase = -180.0f;
                    if (phase > 180.0f) phase = 180.0f;
                    current_phase[0] = phase * (float)M_PI / 180.0f;
                    ESP_LOGI(TAG, "UART: Set channel A phase to %f degrees (%.2f radians)", phase, current_phase[0]);
                } else if (strncmp(cmd_buf, "wpb", 3) == 0) {
                    float phase = strtof(cmd_buf + 3, NULL);
                    if (phase < -180.0f || phase > 180.0f) {
                        ESP_LOGW(TAG, "UART: Invalid channel B phase: %f (Allowed: -180 to +180)", phase);
                    }
                    if (phase < -180.0f) phase = -180.0f;
                    if (phase > 180.0f) phase = 180.0f;
                    current_phase[1] = phase * (float)M_PI / 180.0f;
                    ESP_LOGI(TAG, "UART: Set channel B phase to %f degrees (%.2f radians)", phase, current_phase[1]);
                } else if (strncmp(cmd_buf, "waa", 3) == 0) {
                    float ampl = strtof(cmd_buf + 3, NULL);
                    if (ampl < 0.0f) ampl = 0.0f;
                    if (ampl > 100.0f) ampl = 100.0f;
                    target_ampl[0] = ampl / 100.0f;
                    ESP_LOGI(TAG, "UART: Set channel A amplitude to %.2f (0-100, scaled to 0.0-1.0)", ampl);
                } else if (strncmp(cmd_buf, "wab", 3) == 0) {
                    float ampl = strtof(cmd_buf + 3, NULL);
                    if (ampl < 0.0f) ampl = 0.0f;
                    if (ampl > 100.0f) ampl = 100.0f;
                    target_ampl[1] = ampl / 100.0f;
                    ESP_LOGI(TAG, "UART: Set channel B amplitude to %.2f (0-100, scaled to 0.0-1.0)", ampl);
                } else if (strncmp(cmd_buf, "wha", 3) == 0 || strncmp(cmd_buf, "whb", 3) == 0) {
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
                            harmonic_percent[ch] = percent / 100.0f;
                            harmonic_phase[ch] = phase_deg * (float)M_PI / 180.0f;
                            pause_dds_timer();
                            generate_cosine_table(ch, TABLE_SIZE);
                            resume_dds_timer();
                            ESP_LOGI(TAG, "UART: Channel %c: Mix in %d-th harmonic at %.1f%%, phase %.1f deg (table regenerated)", ch == 0 ? 'A' : 'B', order, percent, phase_deg);
                        }
                    } else {
                        ESP_LOGW(TAG, "UART: Invalid harmonic command format. Use e.g. wha3,10 or wha3,10,-90");
                    }
                } else if (strcmp(cmd_buf, "buff") == 0) {
                    char buf_info[128];
                    snprintf(buf_info, sizeof(buf_info), "Output buffer content: A %.2f Hz, B %.2f Hz, table size: %d, A ampl: %.2f, B ampl: %.2f\r\n", current_freq[0], current_freq[1], TABLE_SIZE, current_ampl[0], current_ampl[1]);
                    uart_write_bytes(UART_NUM, buf_info, strlen(buf_info));
                    for (int ch = 0; ch < 2; ch++) {
                        snprintf(buf_info, sizeof(buf_info), "Channel %c: ", ch == 0 ? 'A' : 'B');
                        uart_write_bytes(UART_NUM, buf_info, strlen(buf_info));
                        for (int i = 0; i < TABLE_SIZE; i++) {
                            snprintf(buf_info, sizeof(buf_info), "%d%s", cosine_table[ch][i], (i < TABLE_SIZE - 1) ? "," : "\r\n");
                            uart_write_bytes(UART_NUM, buf_info, strlen(buf_info));
                        }
                    }
                } else if (strcmp(cmd_buf, "help") == 0) {
                    const char *help_msg =
                        "Commands:\r\n"
                        "  wfa<freq>   Set channel A frequency in Hz (e.g. wfa1000)\r\n"
                        "  wfb<freq>   Set channel B frequency in Hz (e.g. wfb1000)\r\n"
                        "  wpa<deg>    Set channel A phase in degrees (e.g. wpa90, range -180 to +180)\r\n"
                        "  wpb<deg>    Set channel B phase in degrees (e.g. wpb-90, range -180 to +180)\r\n"
                        "  waa<ampl>   Set channel A amplitude (0-100, e.g. waa50)\r\n"
                        "  wab<ampl>   Set channel B amplitude (0-100, e.g. wab80)\r\n"
                        "  wha<order>,<pct>[,<phase>] Mix odd harmonic to channel A (e.g. wha3,10 or wha3,10,-90)\r\n"
                        "  whb<order>,<pct>[,<phase>] Mix odd harmonic to channel B (e.g. whb5,20,45)\r\n"
                        "  buff        Output buffer content \r\n"
                        "  help        Show this help message\r\n";
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
        
        uint16_t idx = ((dds_acc[ch] + (uint32_t)(current_phase[ch] * (TABLE_SIZE / (2.0f * M_PI)))) % TABLE_SIZE);
        values[ch] = (uint8_t)(cosine_table[ch][idx] * current_ampl[ch]);
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
    for (int ch = 0; ch < 2; ch++) {
        generate_cosine_table(ch, TABLE_SIZE);
    }
    update_dds_step(0, current_freq[0], PERIOD_US);
    update_dds_step(1, current_freq[1], PERIOD_US);
    
    global_gpio_init();
    ESP_LOGI(TAG, "Starting DAC DDS generator. Type 'help' in UART for usage. Frequency range: %d-%d Hz.", MIN_FREQ, MAX_FREQ);
    xTaskCreatePinnedToCore(uart_cmd_task, "uart_cmd_task", 4096, NULL, 5, NULL, 0);
    start_dds_timer(PERIOD_US);
}
