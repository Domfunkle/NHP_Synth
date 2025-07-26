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
#define MAX_HARMONICS 8 // Maximum harmonics across both channels
#define PHASE_SCALE (int)(TABLE_SIZE / (2.0 * M_PI))
#define M_PI_180 (M_PI / 180.0f)

// Per-channel harmonics (arrays for multiple harmonics)
typedef struct {
    int order;
    float percent; // 0-100
    float phase;   // radians
    int phase_offset_int; // cached phase offset for DDS
} harmonic_t;

static volatile harmonic_t harmonics[2][MAX_HARMONICS] = {{{0}}};

// Static Variables
static const char *TAG = "dac_oneshot_test";
static uint8_t waveform_quarter_table[TABLE_SIZE / 4]; // Store only a quarter of the waveform table to save memory

// Per-channel frequency, phase, amplitude, harmonic
static volatile float current_freq[2] = {50, 50}; // [A, B]
static volatile float current_phase[2] = {0, 0};
static volatile float current_ampl[2] = {0.0f, 0.0f}; // Used for output (ramped)
static volatile float target_ampl[2] = {0.0f, 0.0f}; // Set by UART, ramped to

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
// static void pause_dds_timer(void);
// static void resume_dds_timer(void);

// Function Definitions
static void generate_waveform(int table_size) {
    int quarter = table_size / 4;
    for (int i = 0; i < quarter; i++) {
        float phase_val = (M_PI_2 * i) / (float)quarter; // 0 to pi/2
        float val = sinf(phase_val);
        uint8_t value = (uint8_t)((val * 127.5f) + 127.5f); // 0-255 range
        waveform_quarter_table[i] = value;
    }
}
// Helper to reconstruct full sine using quarter table and symmetry
static uint8_t get_waveform_value(uint32_t idx) {
    uint32_t quarter = TABLE_SIZE / 4;
    idx = idx % TABLE_SIZE;
    if (idx < quarter) {
        // 0 to pi/2: +sin
        return waveform_quarter_table[idx];
    } else if (idx < 2 * quarter) {
        // pi/2 to pi: +sin (mirrored, inverted)
        return waveform_quarter_table[quarter - 1 - (idx - quarter)];
    } else if (idx < 3 * quarter) {
        // pi to 3pi/2: -sin
        return 255 - waveform_quarter_table[idx - 2 * quarter];
    } else {
        // 3pi/2 to 2pi: -sin (mirrored, inverted)
        return 255 - waveform_quarter_table[quarter - 1 - (idx - 3 * quarter)];
    }
}

static void update_dds_step(int ch, float frequency, float period_us) {
    dds_step[ch] = (TABLE_SIZE * frequency * period_us / 1000000);
    dds_phase_offset[ch] = (uint32_t)(current_phase[ch] * PHASE_SCALE);
    // ESP_LOGI(TAG, "DDS step and phase offset updated for channel %d: step %lu, phase offset %lu for frequency %.1f Hz", 
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
    // ESP_LOGI(TAG, "UART command task started. Type 'help' for usage.");
    char cmd_buf[32];
    int cmd_pos = 0;
    while (1) {
        uint8_t ch;
        int len = uart_read_bytes(UART_NUM, &ch, 1, pdMS_TO_TICKS(100));
        if (len > 0) {
            if (ch == '\r' || ch == '\n') {
                cmd_buf[cmd_pos] = '\0';
                // Unified frequency read command: rfa / rfb
                if (strncmp(cmd_buf, "rf", 2) == 0 && (cmd_buf[2] == 'a' || cmd_buf[2] == 'b')) {
                    int ch_idx = (cmd_buf[2] == 'a') ? 0 : 1;
                    char response[32];
                    snprintf(response, sizeof(response), "rf%c%.1f\r\n", 
                             ch_idx == 0 ? 'a' : 'b', current_freq[ch_idx]);
                    uart_write_bytes(UART_NUM, response, strlen(response));
                
                // Unified frequency write command: wfa / wfb
                } else if (strncmp(cmd_buf, "wf", 2) == 0 && (cmd_buf[2] == 'a' || cmd_buf[2] == 'b')) {
                    int ch_idx = (cmd_buf[2] == 'a') ? 0 : 1;
                    float freq = strtof(cmd_buf + 3, NULL);
                    if (freq >= MIN_FREQ && freq <= MAX_FREQ) {
                        current_freq[ch_idx] = freq;
                        update_dds_step(ch_idx, current_freq[ch_idx], PERIOD_US);
                        // ESP_LOGI(TAG, "UART: Set channel %c frequency to %.1f Hz", ch_idx == 0 ? 'A' : 'B', freq);
                    } else {
                        ESP_LOGW(TAG, "UART: Invalid channel %c frequency: %.1f (Allowed: %d-%d)", ch_idx == 0 ? 'A' : 'B', freq, MIN_FREQ, MAX_FREQ);
                    }

                // Unified phase read command: rpa / rpb
                } else if (strncmp(cmd_buf, "rp", 2) == 0 && (cmd_buf[2] == 'a' || cmd_buf[2] == 'b')) {
                    int ch_idx = (cmd_buf[2] == 'a') ? 0 : 1;
                    char response[32];
                    snprintf(response, sizeof(response), "rp%c%.1f\r\n", 
                             ch_idx == 0 ? 'a' : 'b', current_phase[ch_idx] * 180.0f / M_PI);
                    uart_write_bytes(UART_NUM, response, strlen(response));

                // Unified phase write command: wpa / wpb
                } else if (strncmp(cmd_buf, "wp", 2) == 0 && (cmd_buf[2] == 'a' || cmd_buf[2] == 'b')) {
                    int ch_idx = (cmd_buf[2] == 'a') ? 0 : 1;
                    float phase = strtof(cmd_buf + 3, NULL);
                    if (phase < -360.0f || phase > 360.0f) {
                        ESP_LOGW(TAG, "UART: Invalid channel %c phase: %f (Allowed: -360 to +360)", ch_idx == 0 ? 'A' : 'B', phase);
                    }
                    if (phase < -360.0f) phase = -360.0f;
                    if (phase > 360.0f) phase = 360.0f;
                    current_phase[ch_idx] = phase * M_PI_180;
                    // ESP_LOGI(TAG, "UART: Set channel %c phase to %f degrees (%.2f radians)", ch_idx == 0 ? 'A' : 'B', phase, current_phase[ch_idx]);
                
                // Unified amplitude read command: raa / rab
                } else if (strncmp(cmd_buf, "ra", 2) == 0 && (cmd_buf[2] == 'a' || cmd_buf[2] == 'b')) {
                    int ch_idx = (cmd_buf[2] == 'a') ? 0 : 1;
                    char response[32];
                    snprintf(response, sizeof(response), "ra%c%.1f\r\n", 
                             ch_idx == 0 ? 'a' : 'b', current_ampl[ch_idx] * 100.0f);
                    uart_write_bytes(UART_NUM, response, strlen(response));

                    // Unified amplitude write command: waa / wab
                } else if (strncmp(cmd_buf, "wa", 2) == 0 && (cmd_buf[2] == 'a' || cmd_buf[2] == 'b')) {
                    int ch_idx = (cmd_buf[2] == 'a') ? 0 : 1;
                    float ampl = strtof(cmd_buf + 3, NULL);
                    if (ampl < 0.0f) ampl = 0.0f;
                    if (ampl > 100.0f) ampl = 100.0f;
                    target_ampl[ch_idx] = ampl / 100.0f;
                    // ESP_LOGI(TAG, "UART: Set channel %c amplitude to %.2f (0-100, scaled to 0.0-1.0)", ch_idx == 0 ? 'A' : 'B', ampl);

                // Shortcut: clear all harmonics for a channel (must come before wh[a|b] command)
                } else if ((strncmp(cmd_buf, "whcl", 4) == 0 && cmd_buf[4] == 'a') ||
                           (strncmp(cmd_buf, "whcl", 4) == 0 && cmd_buf[4] == 'b')) {
                    int ch_idx = (cmd_buf[4] == 'a') ? 0 : 1;
                    for (int i = 0; i < MAX_HARMONICS; ++i) {
                        harmonics[ch_idx][i].order = 0;
                        harmonics[ch_idx][i].percent = 0.0f;
                        harmonics[ch_idx][i].phase = 0.0f;
                    }
                    // ESP_LOGI(TAG, "UART: Cleared all harmonics for channel %c", ch_idx == 0 ? 'A' : 'B');

                // Unified harmonic read command: rha / rhb
                } else if (strncmp(cmd_buf, "rh", 2) == 0 && (cmd_buf[2] == 'a' || cmd_buf[2] == 'b')) {
                    int ch_idx = (cmd_buf[2] == 'a') ? 0 : 1;
                    char response[256];
                    snprintf(response, sizeof(response), "rh%c", ch_idx == 0 ? 'a' : 'b');
                    for (int i = 0; i < MAX_HARMONICS; ++i) {
                        if (harmonics[ch_idx][i].order >= 3 && harmonics[ch_idx][i].percent > 0.0f) {
                            snprintf(response + strlen(response), sizeof(response) - strlen(response),
                                     "%d,%.1f,%.1f;", harmonics[ch_idx][i].order,
                                     harmonics[ch_idx][i].percent * 100.0f,
                                     harmonics[ch_idx][i].phase * 180.0f / M_PI);
                        }
                    }
                    strcat(response, "\r\n");
                    uart_write_bytes(UART_NUM, response, strlen(response));

                // Unified harmonic write command: wha / whb
                } else if (strncmp(cmd_buf, "wh", 2) == 0 && (cmd_buf[2] == 'a' || cmd_buf[2] == 'b')) {
                    int ch_idx = (cmd_buf[2] == 'a') ? 0 : 1;
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
                            // Count total harmonics in use globally
                            int total_harmonics = 0;
                            for (int c = 0; c < 2; ++c) {
                                for (int i = 0; i < MAX_HARMONICS; ++i) {
                                    if (harmonics[c][i].order >= 3 && harmonics[c][i].percent > 0.0f) {
                                        total_harmonics++;
                                    }
                                }
                            }
                            // Add or update harmonic for this channel
                            int found = 0;
                            for (int i = 0; i < MAX_HARMONICS; ++i) {
                                if (harmonics[ch_idx][i].order == order) {
                                    harmonics[ch_idx][i].percent = percent / 100.0f;
                                    harmonics[ch_idx][i].phase = phase_deg * M_PI_180;
                                    harmonics[ch_idx][i].phase_offset_int = (int)(harmonics[ch_idx][i].phase * PHASE_SCALE);
                                    found = 1;
                                    break;
                                }
                            }
                            if (!found && percent > 0.0f) {
                                if (total_harmonics < MAX_HARMONICS) {
                                    for (int i = 0; i < MAX_HARMONICS; ++i) {
                                        if (harmonics[ch_idx][i].order == 0 || harmonics[ch_idx][i].percent == 0.0f) {
                                            harmonics[ch_idx][i].order = order;
                                            harmonics[ch_idx][i].percent = percent / 100.0f;
                                            harmonics[ch_idx][i].phase = phase_deg * M_PI_180;
                                            harmonics[ch_idx][i].phase_offset_int = (int)(harmonics[ch_idx][i].phase * PHASE_SCALE);
                                            found = 1;
                                            break;
                                        }
                                    }
                                } else {
                                    ESP_LOGW(TAG, "UART: Max harmonics reached globally");
                                }
                            }
                            // If percent is 0, the harmonic is disabled (kept in list but ignored)
                        }
                    } else {
                        ESP_LOGW(TAG, "UART: Invalid harmonic command format. Use e.g. wha3,10 or wha3,10,-90");
                    }
                } else if (strcmp(cmd_buf, "help") == 0) {
                    const char *help_msg =
                        "Command: [r|w][f|p|a|h][a|b][<args>]\r\n"
                        "  r=read, w=write; f=frequency, p=phase, a=amplitude, h=harmonic\r\n"
                        "  a=ch A, b=ch B; <args>=value(s) for write\r\n"
                        "\r\n"
                        "Harmonic: wh[a|b]<n>,<percent>[,<phase_deg>]\r\n"
                        "  n=odd harmonic (>=3), percent=0-100, phase_deg=deg (optional)\r\n"
                        "Special:\r\n"
                        "  whcl[a|b]   Clear all harmonics for A/B\r\n"
                        "  help        Show this help\r\n"
                        "\r\n"
                        "Examples:\r\n"
                        "  rfa         Read freq A (ex. response rfa50.0 = 50.0 Hz)\r\n"
                        "  wfb45.5     Set freq B to 45.5 Hz\r\n"
                        "  rpa         Read phase A (ex. response rpa-120.0 = -120.0 deg)\r\n"
                        "  wpa-90      Set phase A to -90 deg\r\n"
                        "  rab         Read amp B (ex. response rab55.0 = 55.0 %)\r\n"
                        "  waa50       Set amp A to 50%\r\n"
                        "  rha         Read harmonics A (ex. response rha3,10.0,0.0;5,20.0,-90.0; = 3rd 10% 0 deg; 5th 20% -90 deg)\r\n"
                        "  wha3,10     Set 3rd harm A to 10%\r\n"
                        "  whb5,5,-90  Set 5th harm B to 5%, -90 deg\r\n";

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
        // Calculate how many DDS timer periods per half square wave period using channel A frequency
        sqw_period_ticks = (int)((1000000.0 / (2 * current_freq[0])) / PERIOD_US);
        sqw_acc = 0;
        sqw_output_state = 0;
        sqw_initialized = true;
        gpio_set_level(SQUARE_WAVE_OUTPUT, sqw_output_state);
    } else {
        // Recalculate period ticks if channel A frequency has changed
        int new_period_ticks = (int)((1000000.0 / (2 * current_freq[0])) / PERIOD_US);
        if (new_period_ticks != sqw_period_ticks) {
            sqw_period_ticks = new_period_ticks;
        }
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
        uint32_t phase_acc = (dds_acc[ch] + (uint32_t)(current_phase[ch] * PHASE_SCALE)) % TABLE_SIZE;
        // Use helper to get base waveform value
        float fundamental_val = ((float)get_waveform_value(phase_acc) - 127.5f) / 127.5f; // -1.0 to 1.0
        float harmonics_sum = 0.0f;

        // Sum all harmonics
        for (int i = 0; i < MAX_HARMONICS; ++i) {
            if (harmonics[ch][i].order >= 3 && (harmonics[ch][i].order % 2) == 1 && harmonics[ch][i].percent > 0.0f) {
                int harmonic_order_val = harmonics[ch][i].order;
                int harmonic_phase_offset_int = harmonics[ch][i].phase_offset_int;
                int harmonic_phase_acc_int = (harmonic_order_val * (int)phase_acc + harmonic_phase_offset_int) % TABLE_SIZE;
                float harmonic_val = ((float)get_waveform_value(harmonic_phase_acc_int) - 127.5f) / 127.5f; // -1.0 to 1.0
                float harmonic_scale = harmonics[ch][i].percent;
                harmonics_sum += harmonic_val * harmonic_scale;
            }
        }

        // Final value: fundamental + sum of harmonics (no normalization)
        float val = fundamental_val + harmonics_sum;
        
        // Apply amplitude scaling first
        val *= current_ampl[ch];
        
        // Convert to 0-255 range
        float dac_val = (val * 127.5f) + 127.5f;
        
        // Clamp to DAC range (0-255)
        if (dac_val > 255.0f) dac_val = 255.0f;
        if (dac_val < 0.0f) dac_val = 0.0f;
        
        uint8_t value = (uint8_t)dac_val;
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

// static void pause_dds_timer(void) {
//     if (dds_timer.handle) {
//         esp_timer_stop(dds_timer.handle);
//     }
// }

// static void resume_dds_timer(void) {
//     if (dds_timer.handle) {
//         esp_timer_start_periodic(dds_timer.handle, dds_timer.period_us);
//     }
// }

void app_main(void) {
    generate_waveform(TABLE_SIZE);
    update_dds_step(0, current_freq[0], PERIOD_US);
    update_dds_step(1, current_freq[1], PERIOD_US);
    
    global_gpio_init();
    // ESP_LOGI(TAG, "Starting DAC DDS generator. Type 'help' in UART for usage. Frequency range: %d-%d Hz.", MIN_FREQ, MAX_FREQ);
    xTaskCreatePinnedToCore(uart_cmd_task, "uart_cmd_task", 4096, NULL, 5, NULL, 1);
    start_dds_timer(PERIOD_US);
}
