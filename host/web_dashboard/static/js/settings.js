// settings.js - Settings Management Module

// Default settings configuration (fallback only)
const DEFAULT_SETTINGS = {
    maxVoltage: 250,
    maxCurrent: 10,
    chartRefreshRate: 100,
    precisionDigits: 2,
    autoSaveSettings: true,
    debugMode: false,
    synthAutoOn: [false, false, false]
};

// Current settings state
let currentSettings = { ...DEFAULT_SETTINGS };

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
        
        // Auto-save if enabled
        if (currentSettings.autoSaveSettings) {
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
    
    console.log('Collected form values:', currentSettings);
}

/**
 * Update the settings UI with current values
 */
function updateSettingsUI() {
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
