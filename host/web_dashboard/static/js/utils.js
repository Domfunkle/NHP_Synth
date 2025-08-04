
// Calculate DPF (Displacement Power Factor) based on phases
export function DPF(phaseA, phaseB) {
    const cosPhi = Math.cos((phaseA - phaseB) * Math.PI / 180);
    return +cosPhi;
}

// Debounce function to limit how often a function can be called
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Calculate THD (Total Harmonic Distortion) for a given set of harmonics
export function THD(harmonics) {
    if (!Array.isArray(harmonics) || harmonics.length === 0) return 0;
    const fundamentalAmplitude = 100;
    const totalHarmonics = harmonics.reduce((sum, h) => sum + (h.amplitude ** 2), 0);
    const thd = Math.sqrt(totalHarmonics) / fundamentalAmplitude;
    return +thd;
}

// Calculate True Power Factor (PF) based THDi and displacement power factor
export function truePF(phaseA, phaseB, harmonics=[]) {
    const dpfValue = DPF(phaseA, phaseB);
    const pf_thd = (Array.isArray(harmonics) && harmonics.length > 0)
        ? Math.sqrt(1 / (1 + THD(harmonics) ** 2))
        : 1;
    return +(pf_thd * dpfValue);
}

// Calculate true RMS for a given waveform with harmonics
export function trueRMS(fundamentalRMS, harmonics=[]) {
    if (!Array.isArray(harmonics) || harmonics.length === 0) return fundamentalRMS;
    const harmonicRMS = THD(harmonics);
    return +(fundamentalRMS * Math.sqrt(1 + harmonicRMS ** 2));
}

// Calculate apparent power
export function apparentPower(voltageRMS, currentRMS) {
    if (voltageRMS === 0 || currentRMS === 0) return 0;
    return +(voltageRMS * currentRMS);
}

// Calculate reactive power
export function reactivePower(voltageRMS, currentRMS, phaseA, phaseB, harmonics=[]) {
    const pf = truePF(phaseA, phaseB, harmonics);
    const apparent = apparentPower(voltageRMS, currentRMS);
    return +(apparent * Math.sqrt(1 - pf ** 2));
}

// Calculate real power
export function activePower(voltageRMS, currentRMS, phaseA, phaseB, harmonics=[]) {
    const pf = truePF(phaseA, phaseB, harmonics);
    return +(apparentPower(voltageRMS, currentRMS) * pf);
}

export function getGlobalFrequencyHz(AppState) {
    if (AppState.synthState && Array.isArray(AppState.synthState.synths) && AppState.synthState.synths.length > 0) {
        const freq = AppState.synthState.synths[0].frequency_a;
        return (freq !== undefined && freq !== null) ? freq : null;
    }
    return null;
}

export function LoadingSpinner() {
    return `
        <div class="col d-flex justify-content-center align-items-center" style="min-height: 200px;">
            <div class="text-center">
                <div class="spinner-border text-primary mb-3" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
                <div class="text-muted">Connecting to synthesizers...</div>
            </div>
        </div>
    `;
}

// Throttle function for high-frequency events (like scroll, resize)
export function throttle(func, wait) {
    let timeout;
    let previous = 0;
    return function executedFunction(...args) {
        const now = Date.now();
        const remaining = wait - (now - previous);
        if (remaining <= 0 || remaining > wait) {
            if (timeout) {
                clearTimeout(timeout);
                timeout = null;
            }
            previous = now;
            func(...args);
        } else if (!timeout) {
            timeout = setTimeout(() => {
                previous = Date.now();
                timeout = null;
                func(...args);
            }, remaining);
        }
    };
}

// Format numbers with units and proper precision
export function formatValue(value, unit, precision = 1) {
    if (typeof value !== 'number' || isNaN(value)) return '--';
    return `${value.toFixed(precision)} ${unit}`;
}

// Clamp value between min and max
export function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

export function roundToPrecision(value, precision) {
    if (typeof value !== 'number' || isNaN(value)) return 0;
    const factor = Math.pow(10, precision);
    return Math.round(value * factor) / factor;
}

export const VOLTAGE_RMS_MAX = 250;
export const CURRENT_RMS_MAX = 10;
