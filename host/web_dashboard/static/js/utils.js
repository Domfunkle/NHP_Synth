
// Calculate DPF (Displacement Power Factor) based on phases
export function DPF(phaseA, phaseB) {
    const cosPhi = Math.cos((phaseA - phaseB) * Math.PI / 180);
    return +cosPhi;
}

// Calculate THD (Total Harmonic Distortion) for a given set of harmonics
export function THD(harmonics) {
    if (!Array.isArray(harmonics) || harmonics.length === 0) return 1;
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

export function getGlobalFrequencyHz(AppState) {
    if (AppState.synthState && Array.isArray(AppState.synthState.synths) && AppState.synthState.synths.length > 0) {
        const freq = AppState.synthState.synths[0].frequency_a;
        return (freq !== undefined && freq !== null) ? freq : null;
    }
    return null;
}

export function LoadingSpinner() {
    return '<div class="col"><div class="alert alert-info">Waiting for data...</div></div>';
}