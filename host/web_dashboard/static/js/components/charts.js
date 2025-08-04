// Chart rendering for NHP Synth Dashboard
// Exported as ES module

export function singlePhaseWaveformChart(synth, canvasId) {
    const amplitudeA = synth.amplitude_a, frequencyA = synth.frequency_a, phaseA = synth.phase_a;
    const amplitudeB = synth.amplitude_b, frequencyB = synth.frequency_b, phaseB = synth.phase_b;
    if ([amplitudeA, frequencyA, phaseA, amplitudeB, frequencyB, phaseB].some(v => v === undefined)) return;
    const scaledAmplitudeA = (amplitudeA / 100) * VOLTAGE_RMS_MAX;
    const scaledAmplitudeB = (amplitudeB / 100) * CURRENT_RMS_MAX;
    const sqrt2 = Math.sqrt(2);
    const peakAmplitudeA = sqrt2 * scaledAmplitudeA;
    const peakAmplitudeB = sqrt2 * scaledAmplitudeB;
    const cycles = 2;
    const N = 200;
    const x = Array.from({ length: (N * cycles) }, (_, i) => (i / N) - cycles/2);
    function sumHarmonics(t, peak, phase, harmonics) {
        let y = peak * Math.sin(2 * Math.PI * frequencyA/40 * t + (phase * Math.PI / 180));
        if (Array.isArray(harmonics)) {
            harmonics.forEach(h => {
                const harmPeak = peak * (h.amplitude / 100);
                y += harmPeak * Math.sin(2 * Math.PI * h.order * frequencyA/40 * t + ((h.phase + (h.order * phase)) * Math.PI / 180));
            });
        }
        return y;
    }
    const yA = x.map(t => sumHarmonics(t, peakAmplitudeA, phaseA, synth.harmonics_a));
    const yB = x.map(t => sumHarmonics(t, peakAmplitudeB, phaseB, synth.harmonics_b));
    const voltageMax = sqrt2 * VOLTAGE_RMS_MAX * 1.1;
    const currentMax = sqrt2 * CURRENT_RMS_MAX * 1.1;

    const phase = 'L' + (synth.id + 1);
    const rootStyles = getComputedStyle(document.documentElement);
    const phaseColorA = rootStyles.getPropertyValue(`--${phase}-voltage-color`);
    const phaseColorB = rootStyles.getPropertyValue(`--${phase}-current-color`);

    const ctx = document.getElementById(canvasId)?.getContext('2d');
    if (!ctx) return;
    if (window[canvasId + '_chart']) {
        window[canvasId + '_chart'].destroy();
    }
    window[canvasId + '_chart'] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: x.map(t => (t * 180).toFixed(0)),
            datasets: [
                {
                    label: 'V',
                    data: yA,
                    borderColor: phaseColorA,
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: false,
                    tension: 0.2,
                    yAxisID: 'yV',
                    order: 2
                },
                {
                    label: 'I',
                    data: yB,
                    borderColor: phaseColorB,
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: false,
                    tension: 0.2,
                    yAxisID: 'yI',
                    order: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'right',
                    reverse: true,
                    fullSize: true,
                    labels: {
                        color: 'white',
                        usePointStyle: true,
                        pointStyle: 'line',
                    }
                },
                tooltip: { enabled: false }
            },
            scales: {
                x: { 
                    position: 'center',
                    grid: { display: false , drawTicks: false },
                    ticks: { display: false },
                    border: { display: true, color: 'gray' }
                },
                yV: {
                    display: false,
                    position: 'left',
                    min: -voltageMax,
                    max: voltageMax,
                    title: { display: false, text: 'Voltage (V)' }
                },
                yI: {
                    display: false,
                    position: 'right',
                    min: -currentMax,
                    max: currentMax,
                    title: { display: false, text: 'Current (A)' },
                    grid: { drawOnChartArea: false },
                }
            }
        }
    });
}

export function threePhaseWaveformChart(synths, canvasId) {
    const synth_L1 = synths[0];
    const synth_L2 = synths[1];
    const synth_L3 = synths[2];
    if (!synth_L1 || !synth_L2 || !synth_L3) return;

    const sqrt2 = Math.sqrt(2);

    const L1_voltage_amplitude = (synth_L1.amplitude_a / 100) * VOLTAGE_RMS_MAX * sqrt2;
    const L2_voltage_amplitude = (synth_L2.amplitude_a / 100) * VOLTAGE_RMS_MAX * sqrt2;
    const L3_voltage_amplitude = (synth_L3.amplitude_a / 100) * VOLTAGE_RMS_MAX * sqrt2;

    const L1_current_amplitude = (synth_L1.amplitude_b / 100) * CURRENT_RMS_MAX * sqrt2;
    const L2_current_amplitude = (synth_L2.amplitude_b / 100) * CURRENT_RMS_MAX * sqrt2;
    const L3_current_amplitude = (synth_L3.amplitude_b / 100) * CURRENT_RMS_MAX * sqrt2;

    const L1_voltage_phase = synth_L1.phase_a;
    const L2_voltage_phase = synth_L2.phase_a;
    const L3_voltage_phase = synth_L3.phase_a;

    const L1_current_phase = synth_L1.phase_b;
    const L2_current_phase = synth_L2.phase_b;
    const L3_current_phase = synth_L3.phase_b;

    const L1_frequency = synth_L1.frequency_a;
    
    const cycles = 2;
    const N = 200;
    const x = Array.from({ length: (N * cycles) }, (_, i) => (i / N) - cycles/2);

    function sumHarmonics(t, amplitude, phase, harmonics) {
        let y = amplitude * Math.sin(2 * Math.PI * L1_frequency/40 * t + (phase * Math.PI / 180));
        if (Array.isArray(harmonics)) {
            harmonics.forEach(h => {
                const harmAmplitude = amplitude * (h.amplitude / 100);
                y += harmAmplitude * Math.sin(2 * Math.PI * h.order * L1_frequency/40 * t + ((h.phase + (h.order * phase)) * Math.PI / 180));
            });
        }
        return y;
    }
    const y_L1_voltage = x.map(t => sumHarmonics(t, L1_voltage_amplitude, L1_voltage_phase, synth_L1.harmonics_a));
    const y_L2_voltage = x.map(t => sumHarmonics(t, L2_voltage_amplitude, L2_voltage_phase, synth_L2.harmonics_a));
    const y_L3_voltage = x.map(t => sumHarmonics(t, L3_voltage_amplitude, L3_voltage_phase, synth_L3.harmonics_a));
    const y_L1_current = x.map(t => sumHarmonics(t, L1_current_amplitude, L1_current_phase, synth_L1.harmonics_b));
    const y_L2_current = x.map(t => sumHarmonics(t, L2_current_amplitude, L2_current_phase, synth_L2.harmonics_b));
    const y_L3_current = x.map(t => sumHarmonics(t, L3_current_amplitude, L3_current_phase, synth_L3.harmonics_b));

    const voltageMax = VOLTAGE_RMS_MAX * sqrt2;
    const currentMax = CURRENT_RMS_MAX * sqrt2;

    const rootStyles = getComputedStyle(document.documentElement);
    const phaseColorL1 = rootStyles.getPropertyValue('--L1-voltage-color').trim();
    const phaseColorL2 = rootStyles.getPropertyValue('--L2-voltage-color').trim();
    const phaseColorL3 = rootStyles.getPropertyValue('--L3-voltage-color').trim();
    const currentColorL1 = rootStyles.getPropertyValue('--L1-current-color').trim();
    const currentColorL2 = rootStyles.getPropertyValue('--L2-current-color').trim();
    const currentColorL3 = rootStyles.getPropertyValue('--L3-current-color').trim();

    const ctx = document.getElementById(canvasId)?.getContext('2d');
    if (!ctx) return;
    if (window[canvasId + '_chart']) {
        window[canvasId + '_chart'].destroy();
    }
    window[canvasId + '_chart'] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: x.map(t => (t * 180).toFixed(0)),
            datasets: [
                {
                    label: 'L1 Voltage',
                    data: y_L1_voltage,
                    borderColor: phaseColorL1,
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: false,
                    tension: 0.2,
                    yAxisID: 'yV',
                    order: 2
                },
                {
                    label: 'L2 Voltage',
                    data: y_L2_voltage,
                    borderColor: phaseColorL2,
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: false,
                    tension: 0.2,
                    yAxisID: 'yV',
                    order: 4
                },
                {
                    label: 'L3 Voltage',
                    data: y_L3_voltage,
                    borderColor: phaseColorL3,
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: false,
                    tension: 0.2,
                    yAxisID: 'yV',
                    order: 6
                },
                {
                    label: 'L1 Current',
                    data: y_L1_current,
                    borderColor: currentColorL1,
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: false,
                    tension: 0.2,
                    yAxisID: 'yI',
                    order: 1
                },
                {
                    label: 'L2 Current',
                    data: y_L2_current,
                    borderColor: currentColorL2,
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: false,
                    tension: 0.2,
                    yAxisID: 'yI',
                    order: 3
                },
                {
                    label: 'L3 Current',
                    data: y_L3_current,
                    borderColor: currentColorL3,
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: false,
                    tension: 0.2,
                    yAxisID: 'yI',
                    order: 5
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'right',
                    reverse: false,
                    fullSize: true,
                    labels: {
                        color: 'white',
                        usePointStyle: true,
                        pointStyle: 'line',
                        padding: 8,
                        generateLabels: function(chart) {
                            const datasets = chart.data.datasets;
                            const groupedLabels = [];
                            
                            // Group by phase (L1, L2, L3)
                            const phases = ['L1', 'L2', 'L3'];
                            phases.forEach(phase => {
                                const voltageDataset = datasets.find(d => d.label === `${phase} Voltage`);
                                const currentDataset = datasets.find(d => d.label === `${phase} Current`);
                                
                                if (voltageDataset) {
                                    groupedLabels.push({
                                        text: `${phase} Voltage`,
                                        fillStyle: voltageDataset.borderColor,
                                        strokeStyle: voltageDataset.borderColor,
                                        fontColor: 'white',
                                        lineWidth: 2,
                                        pointStyle: 'line',
                                        datasetIndex: datasets.indexOf(voltageDataset)
                                    });
                                }
                                if (currentDataset) {
                                    groupedLabels.push({
                                        text: `${phase} Current`,
                                        fillStyle: currentDataset.borderColor,
                                        strokeStyle: currentDataset.borderColor,
                                        fontColor: 'white',
                                        lineWidth: 2,
                                        pointStyle: 'line',
                                        datasetIndex: datasets.indexOf(currentDataset)
                                    });
                                }
                                
                                // Add spacing between phases
                                if (phase !== 'L3') {
                                    groupedLabels.push({
                                        text: '',
                                        fillStyle: 'transparent',
                                        strokeStyle: 'transparent',
                                        fontColor: 'white',
                                        lineWidth: 0,
                                        pointStyle: 'line',
                                        datasetIndex: -1
                                    });
                                }
                            });
                            
                            return groupedLabels;
                        }
                    }
                },
                tooltip: { enabled: false }
            },
            scales: {
                x: { 
                    position: 'center',
                    grid: { display: false , drawTicks: false },
                    ticks: { display: false },
                    border: { display: true, color: 'gray' }
                },
                yV: {
                    display: false,
                    position: 'left',
                    min: -voltageMax * 1.1,
                    max: voltageMax * 1.1,
                    title: { display: false, text: 'Voltage (V)' },
                    grid: { drawOnChartArea: false },
                },
                yI: {
                    display: false,
                    position: 'right',
                    min: -currentMax * 1.1,
                    max: currentMax * 1.1,
                    title: { display: false, text: 'Current (A)' },
                    grid: { drawOnChartArea: false },
                }
            }
        }
    });
}
