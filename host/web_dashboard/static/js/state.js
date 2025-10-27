// Centralized state management for NHP Synth Dashboard

// Storage key for localStorage
const STORAGE_KEY = 'nhp_synth_app_state';

// Load state from localStorage if it exists
function loadStateFromStorage() {
    try {
        const storedState = localStorage.getItem(STORAGE_KEY);
        if (storedState) {
            const parsed = JSON.parse(storedState);
            return {
                synthState: null, // Always start with null - will be populated by server
                openOffcanvasId: parsed.openOffcanvasId || null,
                selectedId: parsed.selectedId || null,
                voltageScale: parsed.voltageScale || 1,
                currentScale: parsed.currentScale || 1,
                timebaseMs: parsed.timebaseMs || 10.0, // ms/div (default 10ms/div)
                timeOffsetMs: parsed.timeOffsetMs || 0, // time offset in ms for horizontal translation
                voltageOffsetV: parsed.voltageOffsetV || 0, // voltage offset in V for vertical translation
                currentOffsetA: parsed.currentOffsetA || 0, // current offset in A for vertical translation
                phaseVisibility: parsed.phaseVisibility || {
                    L1: { voltage: true, current: true },
                    L2: { voltage: true, current: true },
                    L3: { voltage: true, current: true }
                }
            };
        }
    } catch (error) {
        console.warn('Failed to load state from localStorage:', error);
    }
    
    // Return default state if loading fails
    return {
        synthState: null,
        openOffcanvasId: null,
        selectedId: null,
        voltageScale: 1,
        currentScale: 1,
        timebaseMs: 10.0, // ms/div (default 10ms/div)
        timeOffsetMs: 0, // time offset in ms for horizontal translation
        voltageOffsetV: 0, // voltage offset in V for vertical translation
        currentOffsetA: 0, // current offset in A for vertical translation
        phaseVisibility: {
            L1: { voltage: true, current: true },
            L2: { voltage: true, current: true },
            L3: { voltage: true, current: true }
        }
    };
}

// Save state to localStorage (excluding dynamic synthState)
function saveStateToStorage() {
    try {
        const stateToSave = {
            // Don't persist synthState as it's dynamic data from server
            // synthState: AppState.synthState,
            openOffcanvasId: AppState.openOffcanvasId,
            selectedId: AppState.selectedId,
            voltageScale: AppState.voltageScale,
            currentScale: AppState.currentScale,
            timebaseMs: AppState.timebaseMs,
            timeOffsetMs: AppState.timeOffsetMs,
            voltageOffsetV: AppState.voltageOffsetV,
            currentOffsetA: AppState.currentOffsetA,
            phaseVisibility: AppState.phaseVisibility
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
    } catch (error) {
        console.warn('Failed to save state to localStorage:', error);
    }
}

// Initialize AppState with persisted values
export const AppState = loadStateFromStorage();

// Optional mutators for clarity and future extensibility
export function setSynthState(newState) {
    AppState.synthState = newState;
    // Don't persist synthState - it's dynamic data from the server
}
export function setOpenOffcanvasId(id) {
    AppState.openOffcanvasId = id;
    saveStateToStorage();
}
export function setSelectedId(id) {
    AppState.selectedId = id;
    saveStateToStorage();
}
export function setVoltageScale(scale) {
    // Standard oscilloscope voltage scale values
    const validVoltageScales = [10, 20, 50, 100, 200, 500]; // V/div scale multipliers
    
    // Find the closest valid voltage scale
    const closest = validVoltageScales.reduce((prev, curr) => 
        Math.abs(curr - scale) < Math.abs(prev - scale) ? curr : prev
    );
    
    AppState.voltageScale = closest;
    saveStateToStorage();
    updateScaleDisplays();
    rerenderThreePhaseChart();
}

export function stepVoltageScaleUp() {
    const validVoltageScales = [10, 20, 50, 100, 200, 500]; // V/div scale multipliers
    const current = AppState.voltageScale;
    
    // Find the next higher voltage scale
    const nextScale = validVoltageScales.find(scale => scale > current);
    
    // If no higher scale found, stay at the highest
    const targetScale = nextScale || validVoltageScales[validVoltageScales.length - 1];
    AppState.voltageScale = targetScale;
    saveStateToStorage();
    updateScaleDisplays();
    rerenderThreePhaseChart();
}

export function stepVoltageScaleDown() {
    const validVoltageScales = [10, 20, 50, 100, 200, 500]; // V/div scale multipliers
    const current = AppState.voltageScale;
    
    // Find the next lower voltage scale (search from highest to lowest)
    const nextScale = [...validVoltageScales].reverse().find(scale => scale < current);
    
    // If no lower scale found, stay at the lowest
    const targetScale = nextScale || validVoltageScales[0];
    AppState.voltageScale = targetScale;
    saveStateToStorage();
    updateScaleDisplays();
    rerenderThreePhaseChart();
}

export function setCurrentScale(scale) {
    // Standard oscilloscope current scale values
    const validCurrentScales = [0.1, 0.2, 0.5, 1, 2, 5, 10]; // A/div scale multipliers
    
    // Find the closest valid current scale
    const closest = validCurrentScales.reduce((prev, curr) => 
        Math.abs(curr - scale) < Math.abs(prev - scale) ? curr : prev
    );
    
    AppState.currentScale = closest;
    saveStateToStorage();
    updateScaleDisplays();
    rerenderThreePhaseChart();
}

export function stepCurrentScaleUp() {
    const validCurrentScales = [0.1, 0.2, 0.5, 1, 2, 5, 10]; // A/div scale multipliers
    const current = AppState.currentScale;
    
    // Find the next higher current scale
    const nextScale = validCurrentScales.find(scale => scale > current);
    
    // If no higher scale found, stay at the highest
    const targetScale = nextScale || validCurrentScales[validCurrentScales.length - 1];
    AppState.currentScale = targetScale;
    saveStateToStorage();
    updateScaleDisplays();
    rerenderThreePhaseChart();
}

export function stepCurrentScaleDown() {
    const validCurrentScales = [0.1, 0.2, 0.5, 1, 2, 5, 10]; // A/div scale multipliers
    const current = AppState.currentScale;
    
    // Find the next lower current scale (search from highest to lowest)
    const nextScale = [...validCurrentScales].reverse().find(scale => scale < current);
    
    // If no lower scale found, stay at the lowest
    const targetScale = nextScale || validCurrentScales[0];
    AppState.currentScale = targetScale;
    saveStateToStorage();
    updateScaleDisplays();
    rerenderThreePhaseChart();
}
export function setHorizontalScale(scale) {
    // For backwards compatibility, convert scale to timebase
    // scale=1 represents 10ms/div, scale=0.5 would be 5ms/div, scale=2 would be 20ms/div
    const timebaseMs = 10.0 * scale;
    setTimebase(timebaseMs);
}

export function setTimebase(timebaseMs) {
    // Standard oscilloscope timebase values
    const validTimebases = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50]; // ms/div

    // Find the closest valid timebase
    const closest = validTimebases.reduce((prev, curr) => 
        Math.abs(curr - timebaseMs) < Math.abs(prev - timebaseMs) ? curr : prev
    );
    
    AppState.timebaseMs = closest;
    saveStateToStorage();
    updateScaleDisplays();
    rerenderThreePhaseChart();
}

export function stepTimebaseUp() {
    const validTimebases = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50]; // ms/div
    const current = AppState.timebaseMs;
    
    // Find the next higher timebase
    const nextTimebase = validTimebases.find(tb => tb > current);
    
    // If no higher timebase found, stay at the highest
    const targetTimebase = nextTimebase || validTimebases[validTimebases.length - 1];
    AppState.timebaseMs = targetTimebase;
    saveStateToStorage();
    updateScaleDisplays();
    rerenderThreePhaseChart();
}

export function stepTimebaseDown() {
    const validTimebases = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50]; // ms/div
    const current = AppState.timebaseMs;
    
    // Find the next lower timebase (search from highest to lowest)
    const nextTimebase = [...validTimebases].reverse().find(tb => tb < current);
    
    // If no lower timebase found, stay at the lowest
    const targetTimebase = nextTimebase || validTimebases[0];
    AppState.timebaseMs = targetTimebase;
    saveStateToStorage();
    updateScaleDisplays();
    rerenderThreePhaseChart();
}

// Time offset functions for horizontal translation
export function setTimeOffset(offsetMs) {
    AppState.timeOffsetMs = offsetMs;
    saveStateToStorage();
    updateScaleDisplays();
    rerenderThreePhaseChart();
}

export function stepTimeOffsetLeft() {
    // Step left by 1/4 of a division (timebase / 4)
    const stepSize = AppState.timebaseMs / 4;
    AppState.timeOffsetMs -= stepSize;
    saveStateToStorage();
    updateScaleDisplays();
    rerenderThreePhaseChart();
}

export function stepTimeOffsetRight() {
    // Step right by 1/4 of a division (timebase / 4)
    const stepSize = AppState.timebaseMs / 4;
    AppState.timeOffsetMs += stepSize;
    saveStateToStorage();
    updateScaleDisplays();
    rerenderThreePhaseChart();
}

export function resetTimeOffset() {
    AppState.timeOffsetMs = 0;
    saveStateToStorage();
    updateScaleDisplays();
    rerenderThreePhaseChart();
}

// Voltage offset functions for vertical translation
export function setVoltageOffset(offsetV) {
    AppState.voltageOffsetV = offsetV;
    saveStateToStorage();
    updateScaleDisplays();
    rerenderThreePhaseChart();
}

export function stepVoltageOffsetUp() {
    // Step up by 1/4 of a voltage division (based on current scale)
    const VOLTAGE_RMS_MAX = 250; // V RMS max
    const voltagePerDiv = (VOLTAGE_RMS_MAX * Math.sqrt(2) * 2) / 10; // Full scale / 10 divisions
    const stepSize = (voltagePerDiv / 4) / AppState.voltageScale;
    AppState.voltageOffsetV += stepSize;
    saveStateToStorage();
    updateScaleDisplays();
    rerenderThreePhaseChart();
}

export function stepVoltageOffsetDown() {
    // Step down by 1/4 of a voltage division (based on current scale)
    const VOLTAGE_RMS_MAX = 250; // V RMS max
    const voltagePerDiv = (VOLTAGE_RMS_MAX * Math.sqrt(2) * 2) / 10; // Full scale / 10 divisions
    const stepSize = (voltagePerDiv / 4) / AppState.voltageScale;
    AppState.voltageOffsetV -= stepSize;
    saveStateToStorage();
    updateScaleDisplays();
    rerenderThreePhaseChart();
}

export function resetVoltageOffset() {
    AppState.voltageOffsetV = 0;
    saveStateToStorage();
    updateScaleDisplays();
    rerenderThreePhaseChart();
}

// Current offset functions for vertical translation
export function setCurrentOffset(offsetA) {
    AppState.currentOffsetA = offsetA;
    saveStateToStorage();
    updateScaleDisplays();
    rerenderThreePhaseChart();
}

export function stepCurrentOffsetUp() {
    // Step up by 1/4 of a current division (based on current scale)
    const CURRENT_RMS_MAX = 10; // A RMS max
    const currentPerDiv = (CURRENT_RMS_MAX * Math.sqrt(2) * 2) / 10; // Full scale / 10 divisions
    const stepSize = (currentPerDiv / 4) / AppState.currentScale;
    AppState.currentOffsetA += stepSize;
    saveStateToStorage();
    updateScaleDisplays();
    rerenderThreePhaseChart();
}

export function stepCurrentOffsetDown() {
    // Step down by 1/4 of a current division (based on current scale)
    const CURRENT_RMS_MAX = 10; // A RMS max
    const currentPerDiv = (CURRENT_RMS_MAX * Math.sqrt(2) * 2) / 10; // Full scale / 10 divisions
    const stepSize = (currentPerDiv / 4) / AppState.currentScale;
    AppState.currentOffsetA -= stepSize;
    saveStateToStorage();
    updateScaleDisplays();
    rerenderThreePhaseChart();
}

export function resetCurrentOffset() {
    AppState.currentOffsetA = 0;
    saveStateToStorage();
    updateScaleDisplays();
    rerenderThreePhaseChart();
}

// Phase visibility setters and getters
export function setPhaseVisibility(phase, type, visible) {
    if (!AppState.phaseVisibility[phase]) {
        AppState.phaseVisibility[phase] = { voltage: true, current: true };
    }
    if (type === 'voltage' || type === 'current') {
        AppState.phaseVisibility[phase][type] = Boolean(visible);
        saveStateToStorage();
        rerenderAllCharts();
        updatePhaseVisibilityUI(phase, type);
    }
}

export function getPhaseVisibility(phase, type) {
    if (!AppState.phaseVisibility[phase]) {
        return true; // Default to visible
    }
    if (type === 'voltage' || type === 'current') {
        return AppState.phaseVisibility[phase][type];
    }
    return true;
}

// Helper function to re-render the three-phase chart
function rerenderThreePhaseChart() {
    // Import the chart function dynamically if not available
    if (typeof window.threePhaseWaveformChart === 'function' && AppState.synthState?.synths?.length >= 3) {
        try {
            window.threePhaseWaveformChart(
                getSynthState().synths,
                'waveform_three_phase',
                getVoltageScale(),
                getCurrentScale(),
                getTimebase(), // Use the timebase directly
                getTimeOffsetMs(), // Pass the time offset
                getVoltageOffset(), // Pass the voltage offset
                getCurrentOffset() // Pass the current offset
            );
        } catch (error) {
            console.warn('Failed to re-render three-phase chart:', error);
        }
    }
}

// Helper function to re-render all charts
function rerenderAllCharts() {
    // Re-render three-phase chart
    rerenderThreePhaseChart();
}

// Helper function to update scale display elements
function updateScaleDisplays() {
    const timeOffsetSlider = document.getElementById('time-offset-slider');
    const voltageOffsetSlider = document.getElementById('voltage-offset-slider');
    const currentOffsetSlider = document.getElementById('current-offset-slider');

    if (timeOffsetSlider) {
        timeOffsetSlider.value = -AppState.timeOffsetMs;
    }
    if (voltageOffsetSlider) {
        voltageOffsetSlider.value = -AppState.voltageOffsetV;
    }
    if (currentOffsetSlider) {
        currentOffsetSlider.value = -AppState.currentOffsetA;
    }
}

// Helper function to update phase visibility UI elements
export function updatePhaseVisibilityUI(targetPhase = null, targetType = null) {
    const phases = targetPhase ? [targetPhase] : ['L1', 'L2', 'L3'];
    const types = targetType ? [targetType] : ['voltage', 'current'];
    
    phases.forEach(phase => {
        types.forEach(type => {
            const elementId = `toggle-phase-${phase}-${type}`;
            const element = document.getElementById(elementId);
            if (element) {
                const isVisible = getPhaseVisibility(phase, type);
                // Remove existing button outline classes
                for (const cls of element.classList) {
                    if (cls.startsWith('btn-outline-')) {
                        element.classList.remove(cls);
                    }
                }

                // Add appropriate classes based on visibility
                if (isVisible) {
                    element.classList.add(`text-${phase}-${type}`);
                    element.classList.add(`btn-outline-${phase}-${type}`);
                } else {
                    element.classList.add('text-muted');
                    element.classList.add('btn-outline-secondary');
                }
            }
        });
    });
}

// Optional getters
export function getSynthState() {
    return AppState.synthState;
}
export function getOpenOffcanvasId() {
    return AppState.openOffcanvasId;
}
export function getSelectedId() {
    return AppState.selectedId;
}
export function getVoltageScale() {
    return AppState.voltageScale;
}
export function getCurrentScale() {
    return AppState.currentScale;
}
export function getHorizontalScale() {
    // For backwards compatibility, convert timebase to scale
    return AppState.timebaseMs / 10.0;
}

export function getTimebase() {
    return AppState.timebaseMs;
}
export function getTimeOffsetMs() {
    return AppState.timeOffsetMs;
}
export function getVoltageOffset() {
    return AppState.voltageOffsetV;
}
export function getCurrentOffset() {
    return AppState.currentOffsetA;
}
export function getAllPhaseVisibility() {
    return AppState.phaseVisibility;
}
