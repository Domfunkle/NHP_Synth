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
                horizontalScale: parsed.horizontalScale || 1,
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
        horizontalScale: 1,
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
            horizontalScale: AppState.horizontalScale,
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
    // Clamp scale between 0.1 and 10
    const clampedScale = Math.max(0.1, Math.min(5, scale));
    AppState.voltageScale = clampedScale;
    saveStateToStorage();
    updateScaleDisplays();
    rerenderThreePhaseChart();
}
export function setCurrentScale(scale) {
    // Clamp scale between 0.1 and 10
    const clampedScale = Math.max(0.1, Math.min(5, scale));
    AppState.currentScale = clampedScale;
    saveStateToStorage();
    updateScaleDisplays();
    rerenderThreePhaseChart();
}
export function setHorizontalScale(scale) {
    // Clamp scale between 0.1 and 10
    const clampedScale = Math.max(0.1, Math.min(5, scale));
    AppState.horizontalScale = clampedScale;
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
                AppState.synthState.synths,
                'waveform_three_phase',
                AppState.voltageScale,
                AppState.currentScale,
                AppState.horizontalScale
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
    
    // Re-render single-phase charts
    if (typeof window.singlePhaseWaveformChart === 'function' && AppState.synthState?.synths) {
        try {
            AppState.synthState.synths.forEach((synth, idx) => {
                window.singlePhaseWaveformChart(synth, `waveform_single_phase_${idx}`);
            });
        } catch (error) {
            console.warn('Failed to re-render single-phase charts:', error);
        }
    }
}

// Helper function to update scale display elements
function updateScaleDisplays() {
    const voltageDisplay = document.getElementById('voltage-scale-display');
    const currentDisplay = document.getElementById('current-scale-display');
    const horizontalDisplay = document.getElementById('horizontal-scale-display');
    
    if (voltageDisplay) {
        voltageDisplay.textContent = `${AppState.voltageScale.toFixed(1)}x`;
    }
    if (currentDisplay) {
        currentDisplay.textContent = `${AppState.currentScale.toFixed(1)}x`;
    }
    if (horizontalDisplay) {
        horizontalDisplay.textContent = `${AppState.horizontalScale.toFixed(1)}x`;
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
                // Remove existing classes
                element.classList.remove('text-L1-voltage', 'text-L1-current', 'text-L2-voltage', 'text-L2-current', 'text-L3-voltage', 'text-L3-current', 'text-muted');
                // Add appropriate class based on visibility
                if (isVisible) {
                    element.classList.add(`text-${phase}-${type}`);
                } else {
                    element.classList.add('text-muted');
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
    return AppState.horizontalScale;
}
export function getAllPhaseVisibility() {
    return AppState.phaseVisibility;
}
