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

export function threePhaseWaveformChart(synths, canvasId, voltage_scale = 1, current_scale = 1, horizontal_scale = 1) {
    const phaseLabels = ['L1', 'L2', 'L3'];
    const phaseSynths = [synths[0], synths[1], synths[2]];
    
    if (!phaseSynths[0] || !phaseSynths[1] || !phaseSynths[2]) return;

    const sqrt2 = Math.sqrt(2);
    const frequency = phaseSynths[0].frequency_a;
    
    // Calculate amplitudes and phases for all phases using loops
    const phaseData = phaseLabels.map((label, i) => {
        const synth = phaseSynths[i];
        return {
            label,
            voltage: {
                amplitude: (synth.amplitude_a / 100) * VOLTAGE_RMS_MAX * sqrt2 * voltage_scale,
                phase: synth.phase_a,
                harmonics: synth.harmonics_a,
                visible: getPhaseVisibility(label, 'voltage')
            },
            current: {
                amplitude: (synth.amplitude_b / 100) * CURRENT_RMS_MAX * sqrt2 * current_scale,
                phase: synth.phase_b,
                harmonics: synth.harmonics_b,
                visible: getPhaseVisibility(label, 'current')
            }
        };
    });
    
    const cycles = roundToPrecision(2 * horizontal_scale, 2);
    const N = 200;
    const x = Array.from({ length: (N * cycles) }, (_, i) => (i / N) - cycles/2);
    
    function sumHarmonics(t, amplitude, phase, harmonics) {
        let y = amplitude * Math.sin(2 * Math.PI * frequency/40 * t + (phase * Math.PI / 180));
        if (Array.isArray(harmonics)) {
            harmonics.forEach(h => {
                const harmAmplitude = amplitude * (h.amplitude / 100);
                y += harmAmplitude * Math.sin(2 * Math.PI * h.order * frequency/40 * t + ((h.phase + (h.order * phase)) * Math.PI / 180));
            });
        }
        return y;
    }
    
    // Generate waveform data for all phases using loops
    const waveformData = phaseData.map(phase => ({
        label: phase.label,
        voltage: {
            data: x.map(t => sumHarmonics(t, phase.voltage.amplitude, phase.voltage.phase, phase.voltage.harmonics)),
            visible: phase.voltage.visible
        },
        current: {
            data: x.map(t => sumHarmonics(t, phase.current.amplitude, phase.current.phase, phase.current.harmonics)),
            visible: phase.current.visible
        }
    }));

    const voltageMax = VOLTAGE_RMS_MAX * sqrt2;
    const currentMax = CURRENT_RMS_MAX * sqrt2;

    // Get colors for all phases using loops
    const rootStyles = getComputedStyle(document.documentElement);
    const colors = phaseLabels.reduce((acc, label) => {
        acc[label] = {
            voltage: rootStyles.getPropertyValue(`--${label}-voltage-color`).trim(),
            current: rootStyles.getPropertyValue(`--${label}-current-color`).trim()
        };
        return acc;
    }, {});

    const ctx = document.getElementById(canvasId)?.getContext('2d');
    if (!ctx) return;
    if (window[canvasId + '_chart']) {
        window[canvasId + '_chart'].destroy();
    }

    // Generate datasets using loops
    const datasets = [];
    
    waveformData.forEach((phase, i) => {
        // Add voltage dataset
        datasets.push({
            label: `${phase.label} Voltage`,
            data: phase.voltage.data,
            borderColor: colors[phase.label].voltage,
            borderWidth: 2,
            pointRadius: 0,
            fill: false,
            tension: 0.2,
            yAxisID: 'yV',
            order: (i + 1) * 2, // 2, 4, 6 for L1, L2, L3 voltage
            hidden: !phase.voltage.visible
        });
        
        // Add current dataset
        datasets.push({
            label: `${phase.label} Current`,
            data: phase.current.data,
            borderColor: colors[phase.label].current,
            borderWidth: 2,
            pointRadius: 0,
            fill: false,
            tension: 0.2,
            yAxisID: 'yI',
            order: (i + 1) * 2 - 1, // 1, 3, 5 for L1, L2, L3 current
            hidden: !phase.current.visible
        });
    });

    window[canvasId + '_chart'] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: x.map(t => (t * 180).toFixed(0)),
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: {
                legend: { display: false },
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
