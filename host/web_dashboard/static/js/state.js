// Centralized state management for NHP Synth Dashboard
export const AppState = {
    synthState: null,
    openOffcanvasId: null,
    selectedId: null,
    voltageScale: 1,
    currentScale: 1,
    horizontalScale: 1
};

// Optional mutators for clarity and future extensibility
export function setSynthState(newState) {
    AppState.synthState = newState;
}
export function setOpenOffcanvasId(id) {
    AppState.openOffcanvasId = id;
}
export function setSelectedId(id) {
    AppState.selectedId = id;
}
export function setVoltageScale(scale) {
    // Clamp scale between 0.1 and 10
    const clampedScale = Math.max(0.1, Math.min(5, scale));
    AppState.voltageScale = clampedScale;
    
    // Update scale displays
    updateScaleDisplays();
    
    // Re-render the three-phase chart with updated scale
    rerenderThreePhaseChart();
}
export function setCurrentScale(scale) {
    // Clamp scale between 0.1 and 10
    const clampedScale = Math.max(0.1, Math.min(5, scale));
    AppState.currentScale = clampedScale;
    
    // Update scale displays
    updateScaleDisplays();
    
    // Re-render the three-phase chart with updated scale
    rerenderThreePhaseChart();
}
export function setHorizontalScale(scale) {
    // Clamp scale between 0.1 and 10
    const clampedScale = Math.max(0.1, Math.min(5, scale));
    AppState.horizontalScale = clampedScale;
    
    // Update scale displays
    updateScaleDisplays();
    
    // Re-render the three-phase chart with updated scale
    rerenderThreePhaseChart();
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
