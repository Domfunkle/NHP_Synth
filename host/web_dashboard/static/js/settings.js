// settings.js - Settings Management Module

// Default settings configuration (fallback only)
const DEFAULT_SETTINGS = {
    maxVoltage: 250,
    maxCurrent: 10,
    chartRefreshRate: 100,
    precisionDigits: 2,
    autoSaveSettings: true,
    debugMode: false,
    synthAutoOn: [false, false, false],
    harmonicCalibration: {
        enabled: false,
        mode: 'linear',
        linearA: 0,
        perHarmonic: {}
    }
};

// Current settings state
let currentSettings = { ...DEFAULT_SETTINGS };
const HARMONIC_ORDERS = [3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31];

function ensurePerHarmonicInputs() {
    const grid = document.getElementById('harmonic-per-grid');
    if (!grid || grid.dataset.built === '1') return;

    grid.innerHTML = HARMONIC_ORDERS.map((order) => `
        <div class="col-6">
            <label for="harmonic-per-${order}" class="form-label small mb-1">H${order}</label>
            <input type="number" class="form-control form-control-sm touch-entry touch-entry-numeric" id="harmonic-per-${order}" step="0.1" value="0" data-touch-steps="1,5,10,30,45">
        </div>
    `).join('');

    grid.dataset.built = '1';
}

function readPerHarmonicInputs() {
    ensurePerHarmonicInputs();
    const result = {};
    HARMONIC_ORDERS.forEach((order) => {
        const input = document.getElementById(`harmonic-per-${order}`);
        if (!input) return;
        const value = parseFloat(input.value || '0');
        if (!isNaN(value)) {
            result[String(order)] = value;
        }
    });
    return result;
}

function writePerHarmonicInputs(perHarmonic) {
    ensurePerHarmonicInputs();
    HARMONIC_ORDERS.forEach((order) => {
        const input = document.getElementById(`harmonic-per-${order}`);
        if (!input) return;
        const raw = perHarmonic && Object.prototype.hasOwnProperty.call(perHarmonic, String(order))
            ? perHarmonic[String(order)]
            : 0;
        const value = parseFloat(raw);
        input.value = Number.isFinite(value) ? value : 0;
    });
}

function updateHarmonicCalibrationModeUI(modeOverride = null) {
    const mode = modeOverride || currentSettings?.harmonicCalibration?.mode || 'linear';
    const linearWrap = document.getElementById('harmonic-linear-wrap');
    const perWrap = document.getElementById('harmonic-per-wrap');
    if (linearWrap) linearWrap.style.display = mode === 'linear' ? '' : 'none';
    if (perWrap) perWrap.style.display = mode === 'per_harmonic' ? '' : 'none';
}

/**
 * Initialize settings from server
 */
export async function initializeSettings() {
    try {
        const response = await fetch('/api/settings');
        if (response.ok) {
            const serverSettings = await response.json();
            currentSettings = { ...DEFAULT_SETTINGS, ...serverSettings };
            console.log('Settings loaded from server:', currentSettings);
        } else {
            console.warn('Failed to load settings from server, using defaults');
        }
    } catch (error) {
        console.error('Error loading settings from server:', error);
        console.log('Using default settings:', currentSettings);
    }
    
    // Update UI with current settings
    updateSettingsUI();
    
    // Set last saved timestamp if available
    if (currentSettings.lastSaved) {
        updateLastSavedTimestamp(currentSettings.lastSaved);
    }
}

export function applyServerSettings(serverSettings) {
    if (!serverSettings || typeof serverSettings !== 'object') return;
    currentSettings = { ...DEFAULT_SETTINGS, ...serverSettings };
    updateSettingsUI();
    if (currentSettings.lastSaved) {
        updateLastSavedTimestamp(currentSettings.lastSaved);
    }
}

/**
 * Get current settings
 */
export function getSettings() {
    return { ...currentSettings };
}

/**
 * Get a specific setting value
 */
export function getSetting(key) {
    return currentSettings[key];
}

/**
 * Update a specific setting
 */
export async function setSetting(key, value) {
    if (key in currentSettings) {
        currentSettings[key] = value;
        
        // Harmonic calibration must always persist immediately so changes are applied live.
        if (key === 'harmonicCalibration' || currentSettings.autoSaveSettings) {
            await saveSettingsToServer();
        }
        
        console.log(`Setting updated: ${key} = ${value}`);
        return true;
    }
    console.warn(`Unknown setting key: ${key}`);
    return false;
}

/**
 * Update multiple settings at once
 */
export async function updateSettings(newSettings) {
    const updatedKeys = [];
    
    for (const [key, value] of Object.entries(newSettings)) {
        if (key in currentSettings) {
            currentSettings[key] = value;
            updatedKeys.push(key);
        }
    }
    
    // Auto-save if enabled
    if (currentSettings.autoSaveSettings) {
        await saveSettingsToServer();
    }
    
    console.log('Settings updated:', updatedKeys);
    return updatedKeys;
}

/**
 * Reset settings to defaults
 */
export async function resetSettings() {
    try {
        const response = await fetch('/api/settings/reset', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            const result = await response.json();
            currentSettings = { ...DEFAULT_SETTINGS, ...result.settings };
            updateSettingsUI();
            
            if (result.settings.lastSaved) {
                updateLastSavedTimestamp(result.settings.lastSaved);
            } else {
                document.getElementById('settings-last-saved').textContent = 'Just now';
            }
            
            console.log('Settings reset to defaults');
            showSaveConfirmation();
            return true;
        } else {
            const error = await response.json();
            console.error('Failed to reset settings:', error.error);
            showSaveError();
            return false;
        }
    } catch (error) {
        console.error('Error resetting settings:', error);
        showSaveError();
        return false;
    }
}

/**
 * Reset only harmonic calibration settings to defaults.
 */
export async function resetHarmonicCalibration() {
    try {
        const response = await fetch('/api/settings/reset-harmonic-calibration', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            const result = await response.json();
            currentSettings = { ...DEFAULT_SETTINGS, ...result.settings };
            updateSettingsUI();

            if (result.settings.lastSaved) {
                updateLastSavedTimestamp(result.settings.lastSaved);
            } else {
                document.getElementById('settings-last-saved').textContent = 'Just now';
            }

            console.log('Harmonic calibration reset to defaults');
            showSaveConfirmation();
            return true;
        }

        const error = await response.json();
        console.error('Failed to reset harmonic calibration:', error.error);
        showSaveError();
        return false;
    } catch (error) {
        console.error('Error resetting harmonic calibration:', error);
        showSaveError();
        return false;
    }
}

/**
 * Save settings to server
 */
export async function saveSettingsToServer() {
    try {
        // Collect current values from DOM before saving
        collectCurrentFormValues();
        
        const response = await fetch('/api/settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(currentSettings)
        });
        
        if (response.ok) {
            const result = await response.json();
            currentSettings = { ...currentSettings, ...result.settings };
            
            if (result.settings.lastSaved) {
                updateLastSavedTimestamp(result.settings.lastSaved);
            } else {
                updateLastSavedTimestamp();
            }
            
            console.log('Settings saved to server');
            showSaveConfirmation();
            return true;
        } else {
            const error = await response.json();
            console.error('Failed to save settings:', error.error);
            showSaveError();
            return false;
        }
    } catch (error) {
        console.error('Error saving settings:', error);
        showSaveError();
        return false;
    }
}

/**
 * Collect current values from form elements
 */
function collectCurrentFormValues() {
    // Hardware limits
    const maxVoltageInput = document.getElementById('max-voltage-setting');
    const maxCurrentInput = document.getElementById('max-current-setting');
    
    if (maxVoltageInput && maxVoltageInput.value) {
        currentSettings.maxVoltage = parseInt(maxVoltageInput.value);
    }
    if (maxCurrentInput && maxCurrentInput.value) {
        currentSettings.maxCurrent = parseInt(maxCurrentInput.value);
    }
    
    // Chart settings
    const chartRefreshInput = document.getElementById('chart-refresh-rate');
    const precisionDigitsInput = document.getElementById('precision-digits');
    
    if (chartRefreshInput && chartRefreshInput.value) {
        currentSettings.chartRefreshRate = parseInt(chartRefreshInput.value);
    }
    if (precisionDigitsInput && precisionDigitsInput.value) {
        currentSettings.precisionDigits = parseInt(precisionDigitsInput.value);
    }
    
    // System settings
    const autoSaveCheckbox = document.getElementById('auto-save-settings');
    const debugModeCheckbox = document.getElementById('debug-mode');
    
    if (autoSaveCheckbox) {
        currentSettings.autoSaveSettings = autoSaveCheckbox.checked;
    }
    if (debugModeCheckbox) {
        currentSettings.debugMode = debugModeCheckbox.checked;
    }
    
    // Synth auto-on settings
    const synthAutoOnCheckboxes = ['synth-auto-on-0', 'synth-auto-on-1', 'synth-auto-on-2'];
    const autoOnValues = [];
    synthAutoOnCheckboxes.forEach((id, index) => {
        const checkbox = document.getElementById(id);
        if (checkbox) {
            autoOnValues[index] = checkbox.checked;
        } else {
            autoOnValues[index] = currentSettings.synthAutoOn ? currentSettings.synthAutoOn[index] : false;
        }
    });
    currentSettings.synthAutoOn = autoOnValues;

    // Harmonic calibration settings
    const harmonicEnabled = document.getElementById('harmonic-cal-enabled');
    const harmonicMode = document.getElementById('harmonic-cal-mode');
    const harmonicLinearA = document.getElementById('harmonic-linear-a');
    const currentHarmonic = currentSettings.harmonicCalibration || {
        enabled: false,
        mode: 'linear',
        linearA: 0,
        perHarmonic: {}
    };

    currentSettings.harmonicCalibration = {
        enabled: harmonicEnabled ? harmonicEnabled.checked : !!currentHarmonic.enabled,
        mode: harmonicMode ? harmonicMode.value : (currentHarmonic.mode || 'linear'),
        linearA: harmonicLinearA ? parseFloat(harmonicLinearA.value || '0') : parseFloat(currentHarmonic.linearA || 0),
        perHarmonic: readPerHarmonicInputs()
    };

    if (isNaN(currentSettings.harmonicCalibration.linearA)) {
        currentSettings.harmonicCalibration.linearA = 0;
    }
    
    console.log('Collected form values:', currentSettings);
}

/**
 * Update the settings UI with current values
 */
function updateSettingsUI() {
    ensurePerHarmonicInputs();
    // Hardware limits
    const maxVoltageInput = document.getElementById('max-voltage-setting');
    const maxCurrentInput = document.getElementById('max-current-setting');
    const currentMaxVoltageSpan = document.getElementById('current-max-voltage');
    const currentMaxCurrentSpan = document.getElementById('current-max-current');

    if (maxVoltageInput) {
        maxVoltageInput.value = currentSettings.maxVoltage;
    }
    if (maxCurrentInput) {
        maxCurrentInput.value = currentSettings.maxCurrent;
    }
    if (currentMaxVoltageSpan) {
        currentMaxVoltageSpan.textContent = currentSettings.maxVoltage;
    }
    if (currentMaxCurrentSpan) {
        currentMaxCurrentSpan.textContent = currentSettings.maxCurrent;
    }

    // Display settings
    const chartRefreshSelect = document.getElementById('chart-refresh-rate');
    const precisionSelect = document.getElementById('precision-digits');

    if (chartRefreshSelect) {
        chartRefreshSelect.value = currentSettings.chartRefreshRate;
    }
    if (precisionSelect) {
        precisionSelect.value = currentSettings.precisionDigits;
    }

    // System settings
    const autoSaveCheckbox = document.getElementById('auto-save-settings');
    const debugModeCheckbox = document.getElementById('debug-mode');

    if (autoSaveCheckbox) {
        autoSaveCheckbox.checked = currentSettings.autoSaveSettings;
    }
    if (debugModeCheckbox) {
        debugModeCheckbox.checked = currentSettings.debugMode;
    }

    // Synth auto-on settings
    const synthAutoOnCheckboxes = ['synth-auto-on-0', 'synth-auto-on-1', 'synth-auto-on-2'];
    synthAutoOnCheckboxes.forEach((id, index) => {
        const checkbox = document.getElementById(id);
        if (checkbox && currentSettings.synthAutoOn && currentSettings.synthAutoOn[index] !== undefined) {
            checkbox.checked = currentSettings.synthAutoOn[index];
        }
    });

    // Harmonic calibration settings
    const harmonicCfg = currentSettings.harmonicCalibration || {
        enabled: false,
        mode: 'linear',
        linearA: 0,
        perHarmonic: {}
    };
    const harmonicEnabled = document.getElementById('harmonic-cal-enabled');
    const harmonicMode = document.getElementById('harmonic-cal-mode');
    const harmonicLinearA = document.getElementById('harmonic-linear-a');

    if (harmonicEnabled) {
        harmonicEnabled.checked = !!harmonicCfg.enabled;
    }
    if (harmonicMode) {
        harmonicMode.value = harmonicCfg.mode || 'linear';
    }
    if (harmonicLinearA) {
        harmonicLinearA.value = Number.isFinite(Number(harmonicCfg.linearA)) ? Number(harmonicCfg.linearA) : 0;
    }
    writePerHarmonicInputs(harmonicCfg.perHarmonic || {});
    updateHarmonicCalibrationModeUI();

    // Debug: Add close browser button if in debug mode
    let closeBtn = document.getElementById('close-browser-btn');
    // Find the Display & System card body
    const displaySystemCardBody = document.querySelector('.col-4 .card.border-info .card-body');
    if (currentSettings.debugMode) {
        if (!closeBtn) {
            closeBtn = document.createElement('button');
            closeBtn.id = 'close-browser-btn';
            closeBtn.className = 'btn btn-danger mt-3';
            closeBtn.textContent = 'Close Browser (Debug)';
            closeBtn.onclick = function() {
                window.close();
            };
            if (displaySystemCardBody) {
                displaySystemCardBody.appendChild(closeBtn);
            } else {
                document.body.appendChild(closeBtn);
            }
        } else {
            closeBtn.style.display = '';
            // Move the button if it's not in the right place
            if (displaySystemCardBody && closeBtn.parentElement !== displaySystemCardBody) {
                displaySystemCardBody.appendChild(closeBtn);
            }
        }
    } else if (closeBtn) {
        closeBtn.style.display = 'none';
    }
}

/**
 * Setup event listeners for settings controls
 */
export function setupSettingsListeners() {
    ensurePerHarmonicInputs();
    // Hardware limits
    const maxVoltageInput = document.getElementById('max-voltage-setting');
    const maxCurrentInput = document.getElementById('max-current-setting');
    
    if (maxVoltageInput) {
        maxVoltageInput.addEventListener('change', async (e) => {
            const value = parseFloat(e.target.value);
            if (value > 0 && value <= 500) {
                await setSetting('maxVoltage', value);
                document.getElementById('current-max-voltage').textContent = value;
            }
        });
    }
    
    if (maxCurrentInput) {
        maxCurrentInput.addEventListener('change', async (e) => {
            const value = parseFloat(e.target.value);
            if (value > 0 && value <= 50) {
                await setSetting('maxCurrent', value);
                document.getElementById('current-max-current').textContent = value;
            }
        });
    }
    
    // Display settings
    const chartRefreshSelect = document.getElementById('chart-refresh-rate');
    const precisionSelect = document.getElementById('precision-digits');
    
    if (chartRefreshSelect) {
        chartRefreshSelect.addEventListener('change', async (e) => {
            await setSetting('chartRefreshRate', parseInt(e.target.value));
        });
    }
    
    if (precisionSelect) {
        precisionSelect.addEventListener('change', async (e) => {
            await setSetting('precisionDigits', parseInt(e.target.value));
        });
    }
    
    // System settings
    const autoSaveCheckbox = document.getElementById('auto-save-settings');
    const debugModeCheckbox = document.getElementById('debug-mode');
    
    if (autoSaveCheckbox) {
        autoSaveCheckbox.addEventListener('change', async (e) => {
            await setSetting('autoSaveSettings', e.target.checked);
        });
    }
    
    if (debugModeCheckbox) {
        debugModeCheckbox.addEventListener('change', async (e) => {
            await setSetting('debugMode', e.target.checked);
        });
    }
    
    // Synth auto-on settings
    const synthAutoOnCheckboxes = ['synth-auto-on-0', 'synth-auto-on-1', 'synth-auto-on-2'];
    synthAutoOnCheckboxes.forEach((id, index) => {
        const checkbox = document.getElementById(id);
        if (checkbox) {
            checkbox.addEventListener('change', async (e) => {
                const currentAutoOn = currentSettings.synthAutoOn || [false, false, false];
                currentAutoOn[index] = e.target.checked;
                await setSetting('synthAutoOn', currentAutoOn);
            });
        }
    });

    const harmonicEnabled = document.getElementById('harmonic-cal-enabled');
    const harmonicMode = document.getElementById('harmonic-cal-mode');
    const harmonicLinearA = document.getElementById('harmonic-linear-a');
    const harmonicPerInputs = HARMONIC_ORDERS
        .map((order) => document.getElementById(`harmonic-per-${order}`))
        .filter(Boolean);

    function currentHarmonicCfg() {
        const cfg = currentSettings.harmonicCalibration || {
            enabled: false,
            mode: 'linear',
            linearA: 0,
            perHarmonic: {}
        };
        return {
            enabled: !!cfg.enabled,
            mode: cfg.mode || 'linear',
            linearA: Number.isFinite(Number(cfg.linearA)) ? Number(cfg.linearA) : 0,
            perHarmonic: cfg.perHarmonic || {}
        };
    }

    if (harmonicEnabled) {
        harmonicEnabled.addEventListener('change', async (e) => {
            const cfg = currentHarmonicCfg();
            cfg.enabled = e.target.checked;
            await setSetting('harmonicCalibration', cfg);
        });
    }

    if (harmonicMode) {
        harmonicMode.addEventListener('change', async (e) => {
            const cfg = currentHarmonicCfg();
            cfg.mode = e.target.value;
            updateHarmonicCalibrationModeUI(cfg.mode);
            await setSetting('harmonicCalibration', cfg);
        });
    }

    if (harmonicLinearA) {
        harmonicLinearA.addEventListener('change', async (e) => {
            const cfg = currentHarmonicCfg();
            const value = parseFloat(e.target.value || '0');
            cfg.linearA = Number.isFinite(value) ? value : 0;
            await setSetting('harmonicCalibration', cfg);
        });
    }

    harmonicPerInputs.forEach((input) => {
        input.addEventListener('change', async () => {
            const cfg = currentHarmonicCfg();
            cfg.perHarmonic = readPerHarmonicInputs();
            await setSetting('harmonicCalibration', cfg);
        });
    });
}

/**
 * Update the last saved timestamp display
 */
function updateLastSavedTimestamp(isoString = null) {
    const lastSavedElement = document.getElementById('settings-last-saved');
    
    if (lastSavedElement) {
        if (isoString) {
            const date = new Date(isoString);
            const timeString = date.toLocaleTimeString();
            lastSavedElement.textContent = timeString;
        } else {
            const now = new Date();
            const timeString = now.toLocaleTimeString();
            lastSavedElement.textContent = timeString;
        }
    }
}

/**
 * Show visual confirmation that settings were saved
 */
function showSaveConfirmation() {
    const saveButton = document.querySelector('button[onclick="saveSettings()"]');
    if (saveButton) {
        const originalContent = saveButton.innerHTML;
        saveButton.innerHTML = '<i class="bi bi-check-circle me-1"></i>Saved!';
        saveButton.classList.add('btn-success');
        saveButton.classList.remove('btn-outline-success');
        
        setTimeout(() => {
            saveButton.innerHTML = originalContent;
            saveButton.classList.remove('btn-success');
            saveButton.classList.add('btn-outline-success');
        }, 2000);
    }
}

/**
 * Show visual indication of save error
 */
function showSaveError() {
    const saveButton = document.querySelector('button[onclick="saveSettings()"]');
    if (saveButton) {
        const originalContent = saveButton.innerHTML;
        saveButton.innerHTML = '<i class="bi bi-exclamation-circle me-1"></i>Error!';
        saveButton.classList.add('btn-danger');
        saveButton.classList.remove('btn-outline-success');
        
        setTimeout(() => {
            saveButton.innerHTML = originalContent;
            saveButton.classList.remove('btn-danger');
            saveButton.classList.add('btn-outline-success');
        }, 2000);
    }
}

/**
 * Get max voltage setting (replaces VOLTAGE_RMS_MAX constant)
 */
export function getMaxVoltage() {
    return currentSettings.maxVoltage;
}

/**
 * Get max current setting (replaces CURRENT_RMS_MAX constant)
 */
export function getMaxCurrent() {
    return currentSettings.maxCurrent;
}

/**
 * Check if debug mode is enabled
 */
export function isDebugMode() {
    return currentSettings.debugMode;
}

/**
 * Get chart refresh rate in milliseconds
 */
export function getChartRefreshRate() {
    return currentSettings.chartRefreshRate;
}

/**
 * Get precision for number formatting
 */
export function getPrecisionDigits() {
    return currentSettings.precisionDigits;
}

/**
 * Get synth auto-on settings
 */
export function getSynthAutoOn() {
    return currentSettings.synthAutoOn || [false, false, false];
}

/**
 * Get auto-on setting for a specific synth
 */
export function getSynthAutoOnForIndex(index) {
    const autoOnSettings = currentSettings.synthAutoOn || [false, false, false];
    return autoOnSettings[index] || false;
}

export function getHarmonicCalibration() {
    return {
        ...(currentSettings.harmonicCalibration || {
            enabled: false,
            mode: 'linear',
            linearA: 0,
            perHarmonic: {}
        })
    };
}
