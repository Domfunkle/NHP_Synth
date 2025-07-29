// UI Component and rendering functions for NHP Synth Dashboard
// Exported as ES module

export function CombinedWaveformChart(synth, canvasId) {
    // ...existing code...
    const amplitudeA = synth.amplitude_a, frequencyA = synth.frequency_a, phaseA = synth.phase_a;
    const amplitudeB = synth.amplitude_b, frequencyB = synth.frequency_b, phaseB = synth.phase_b;
    if ([amplitudeA, frequencyA, phaseA, amplitudeB, frequencyB, phaseB].some(v => v === undefined)) return;
    const VOLTAGE_RMS_MAX = 240;
    const CURRENT_RMS_MAX = 10;
    const scaledAmplitudeA = (amplitudeA / 100) * VOLTAGE_RMS_MAX;
    const scaledAmplitudeB = (amplitudeB / 100) * CURRENT_RMS_MAX;
    const sqrt2 = Math.sqrt(2);
    const peakAmplitudeA = sqrt2 * scaledAmplitudeA;
    const peakAmplitudeB = sqrt2 * scaledAmplitudeB;
    const cycles = 2;
    const N = 200;
    const x = Array.from({ length: (N * cycles) }, (_, i) => i / N);
    function sumHarmonics(t, peak, phase, harmonics) {
        let y = peak * Math.sin(2 * Math.PI * t + (phase * Math.PI / 180));
        if (Array.isArray(harmonics)) {
            harmonics.forEach(h => {
                const harmPeak = peak * (h.amplitude / 100);
                y += harmPeak * Math.sin(2 * Math.PI * h.order * t + ((h.phase + (h.order * phase)) * Math.PI / 180));
            });
        }
        return y;
    }
    const yA = x.map(t => sumHarmonics(t, peakAmplitudeA, phaseA, synth.harmonics_a));
    const yB = x.map(t => sumHarmonics(t, peakAmplitudeB, phaseB, synth.harmonics_b));
    const voltageMax = sqrt2 * VOLTAGE_RMS_MAX * 1.1;
    const currentMax = sqrt2 * CURRENT_RMS_MAX * 1.1;
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
                    label: 'Voltage',
                    data: yA,
                    borderColor: '#0dcaf0',
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: false,
                    tension: 0.2,
                    yAxisID: 'yV',
                },
                {
                    label: 'Current',
                    data: yB,
                    borderColor: '#ffc107',
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: false,
                    tension: 0.2,
                    yAxisID: 'yI',
                }
            ]
        },
        options: {
            responsive: false,
            animation: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { display: false },
                yV: {
                    display: false,
                    position: 'left',
                    min: -voltageMax,
                    max: voltageMax,
                    title: { display: false, text: 'Voltage (V)' },
                    grid: { drawOnChartArea: false },
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

export function renderHarmonics(harmonics) {
    let cells = [];
    if (Array.isArray(harmonics) && harmonics.length > 0) {
        const sorted = harmonics.slice().sort((a, b) => a.order - b.order);
        for (let i = 0; i < 4; i++) {
            if (sorted[i]) {
                cells.push(`<td class="text-start small py-0">H${sorted[i].order}</td><td class="text-end small py-0">${sorted[i].amplitude}%</td><td class="text-end small py-0">${sorted[i].phase}&deg;</td>`);
            } else {
                cells.push('<td class="text-start small py-0">--</td><td class="text-end small py-0">--</td><td class="text-end small py-0">--</td>');
            }
        }
    } else {
        for (let i = 0; i < 4; i++) {
            cells.push('<td class="text-start small py-0">--</td><td class="text-end small py-0">--</td><td class="text-end small py-0">--</td>');
        }
    }
    let rows = [];
    for (let i = 0; i < 4; i++) {
        rows.push(`<tr>${cells[i]}</tr>`);
    }
    return rows.join('');
}

export function getGlobalFrequencyHz(AppState) {
    if (AppState.synthstate && Array.isArray(AppState.synthstate.synths) && AppState.synthstate.synths.length > 0) {
        const freq = AppState.synthstate.synths[0].frequency_a;
        return (freq !== undefined && freq !== null) ? freq : null;
    }
    return null;
}

export function SynthAccordionItem({ synth, idx, phaseLabel }, AppState) {
    const phase = phaseLabel || `L${idx + 1}`;
    const freqDisplay = (getGlobalFrequencyHz(AppState) !== null) ? `${getGlobalFrequencyHz(AppState)} Hz` : '';
    const chartCanvasId = `waveform_combined_${idx}`;
    const VOLTAGE_RMS_MAX = 240;
    const CURRENT_RMS_MAX = 10;
    const scaledAmplitudeA = (synth.amplitude_a / 100) * VOLTAGE_RMS_MAX;
    const scaledAmplitudeB = (synth.amplitude_b / 100) * CURRENT_RMS_MAX;
    const collapseId = `collapseSynth${idx}`;
    const headingId = `headingSynth${idx}`;
    const offcanvasId = (type) => `offcanvas_${type}_${idx}`;
    let selectionMode = (synth.selection_mode) ? synth.selection_mode : {};
    function highlightIfSelected(func, synthIdx, channel) {
        const mode = selectionMode[func];
        if (!mode) return '';
        if (mode.synth === 'all') return '';
        if (mode.synth === synthIdx && (mode.ch === 'all' || mode.ch === channel)) return true;
        return false;
    }
    const voltageSelected = highlightIfSelected('voltage', idx, 'a') ? 'bg-info-subtle border-info border-2' : '';
    const currentSelected = highlightIfSelected('current', idx, 'b') ? 'bg-warning-subtle border-warning border-2' : '';
    const phaseSelected = (highlightIfSelected('phase', idx, 'a') || highlightIfSelected('phase', idx, 'b')) ? 'bg-secondary-subtle border-secondary border-2' : '';
    const frequencySelected = highlightIfSelected('frequency', idx, 'all') ? 'bg-light-subtle border-light border-2' : '';

    return `
        <div class="accordion-item bg-transparent border-0">
            <h2 class="accordion-header" id="${headingId}">
                <button class="accordion-button collapsed py-2" type="button" data-bs-toggle="collapse" data-bs-target="#${collapseId}" aria-expanded="false" aria-controls="${collapseId}">
                    <div class="col-1 fw-bold">${phase}</div>
                    <div class="col-2 text-end">${freqDisplay}</div>
                    <div class="col pe-4">
                        <div class="row text-info">
                            <div class="col text-end ${voltageSelected}">${scaledAmplitudeA.toFixed(1)} V</div>
                            <div class="col-1 text-end">&ang;</div>
                            <div class="col text-end ${phaseSelected}">${synth.phase_a + '°'}</div>
                        </div>
                        <div class="row text-warning">
                            <div class="col text-end ${currentSelected}">${scaledAmplitudeB.toFixed(2)} A</div>
                            <div class="col-1 text-end">&ang;</div>
                            <div class="col text-end ${phaseSelected}">${synth.phase_b + '°'}</div>
                        </div>
                    </div>
                </button>
            </h2>
            <div id="${collapseId}" class="accordion-collapse collapse" aria-labelledby="${headingId}" data-bs-parent="#synthAccordion">
                <div class="accordion-body bg-dark p-2">
                    <div class="row">
                        <div class="col-auto">
                                <button class="btn btn-outline-info fw-bold w-100 mb-2 ${voltageSelected}" type="button" style="min-width:48px" data-bs-toggle="offcanvas" data-bs-target="#${offcanvasId('voltage')}">V</button>
                                <button class="btn btn-outline-warning fw-bold w-100 mb-2 ${currentSelected}" type="button" style="min-width:48px" data-bs-toggle="offcanvas" data-bs-target="#${offcanvasId('current')}">I</button>
                                <!-- Offcanvas for Voltage -->
                            <div class="offcanvas offcanvas-bottom" style="height:45vh" data-bs-backdrop="false" tabindex="-1" id="${offcanvasId('voltage')}" aria-labelledby="${offcanvasId('voltage')}_label">
                                <div class="offcanvas-header py-1" style="min-height:32px;max-height:38px;">
                                    <h5 class="offcanvas-title py-1 fs-6" id="${offcanvasId('voltage')}_label">Set Voltage (L${idx + 1})</h5>
                                    <button type="button" class="btn-close text-reset" data-bs-dismiss="offcanvas" aria-label="Close"></button>
                                </div>
                                <div class="offcanvas-body d-flex flex-column align-items-center p-2" style="overflow-y:hidden;">
                                    <div class="input-group mb-2 justify-content-start">
                                        <div class="input-group-text fs-5" style="min-width:40px">V</div>
                                        <button class="btn btn-outline-info p-2" type="button" style="min-width:68px" onclick="window.incrementVoltage && window.incrementVoltage(${idx}, -10)">-10</button>
                                        <button class="btn btn-outline-info p-2" type="button" style="min-width:68px" onclick="window.incrementVoltage && window.incrementVoltage(${idx}, -1)">-1</button>
                                        <button class="btn btn-outline-info p-2" type="button" style="min-width:68px" onclick="window.incrementVoltage && window.incrementVoltage(${idx}, -0.1)">-0.1</button>
                                        <input type="text" class="form-control text-center mx-1 fs-5" style="width:90px;max-width:90px;" id="voltage_input_${idx}" value="${scaledAmplitudeA.toFixed(1)}" onblur="window.setVoltageDirect && window.setVoltageDirect(${idx}, this.value)" onkeydown="if(event.key==='Enter'){window.setVoltageDirect && window.setVoltageDirect(${idx}, this.value)}">
                                        <button class="btn btn-outline-info p-2" type="button" style="min-width:68px" onclick="window.incrementVoltage && window.incrementVoltage(${idx}, 0.1)">+0.1</button>
                                        <button class="btn btn-outline-info p-2" type="button" style="min-width:68px" onclick="window.incrementVoltage && window.incrementVoltage(${idx}, 1)">+1</button>
                                        <button class="btn btn-outline-info p-2" type="button" style="min-width:68px" onclick="window.incrementVoltage && window.incrementVoltage(${idx}, 10)">+10</button>
                                        <div class="input-group-text text-muted" style="min-width:120px">0 - 240 V<sub>rms</sub></div>
                                        <button class="btn btn-outline-danger p-2 ms-4" type="button" onclick="window.resetVoltage && window.resetVoltage(${idx})"><span class="bi bi-arrow-clockwise"></span></button>
                                    </div>
                                    <div class="input-group mb-2 justify-content-start">
                                        <div class="input-group-text fs-5" style="min-width:40px">&Phi;</div>
                                        <button class="btn btn-outline-light p-2" type="button" style="min-width:68px" onclick="window.incrementPhase && window.incrementPhase(${idx}, 'a', -10)">-10</button>
                                        <button class="btn btn-outline-light p-2" type="button" style="min-width:68px" onclick="window.incrementPhase && window.incrementPhase(${idx}, 'a', -1)">-1</button>
                                        <button class="btn btn-outline-light p-2" type="button" style="min-width:68px" onclick="window.incrementPhase && window.incrementPhase(${idx}, 'a', -0.1)">-0.1</button>
                                        <input type="text" class="form-control text-center mx-1 fs-5" style="width:90px;max-width:90px;" id="phase_input_${idx}" value="${synth.phase_a.toFixed(1)}" onblur="window.setPhaseDirect && window.setPhaseDirect(${idx}, 'a', this.value)" onkeydown="if(event.key==='Enter'){window.setPhaseDirect && window.setPhaseDirect(${idx}, 'a', this.value)}">
                                        <button class="btn btn-outline-light p-2" type="button" style="min-width:68px" onclick="window.incrementPhase && window.incrementPhase(${idx}, 'a', 0.1)">+0.1</button>
                                        <button class="btn btn-outline-light p-2" type="button" style="min-width:68px" onclick="window.incrementPhase && window.incrementPhase(${idx}, 'a', 1)">+1</button>
                                        <button class="btn btn-outline-light p-2" type="button" style="min-width:68px" onclick="window.incrementPhase && window.incrementPhase(${idx}, 'a', 10)">+10</button>
                                        <div class="input-group-text text-muted" style="min-width:120px">0 - 360 °</div>
                                        <button class="btn btn-outline-danger p-2 ms-4" type="button" onclick="window.resetPhase && window.resetPhase(${idx}, 'a')"><span class="bi bi-arrow-clockwise"></span></button>
                                    </div>
                                    <div class="input-group mb-2 justify-content-start">
                                        <div class="input-group-text fs-5" style="min-width:40px">&#131;</div>
                                        <button class="btn btn-outline-light p-2" type="button" style="min-width:68px" onclick="window.incrementFrequency && window.incrementFrequency(-10)">-10</button>
                                        <button class="btn btn-outline-light p-2" type="button" style="min-width:68px" onclick="window.incrementFrequency && window.incrementFrequency(-1)">-1</button>
                                        <button class="btn btn-outline-light p-2" type="button" style="min-width:68px" onclick="window.incrementFrequency && window.incrementFrequency(-0.1)">-0.1</button>
                                        <input type="text" class="form-control text-center mx-1 fs-5" style="width:90px;max-width:90px;" id="frequency_input_${idx}" value="${synth.frequency_a.toFixed(1)}" onblur="window.setFrequencyDirect && window.setFrequencyDirect(${idx}, this.value)" onkeydown="if(event.key==='Enter'){window.setFrequencyDirect && window.setFrequencyDirect(${idx}, this.value)}">
                                        <button class="btn btn-outline-light p-2" type="button" style="min-width:68px" onclick="window.incrementFrequency && window.incrementFrequency(0.1)">+0.1</button>
                                        <button class="btn btn-outline-light p-2" type="button" style="min-width:68px" onclick="window.incrementFrequency && window.incrementFrequency(1)">+1</button>
                                        <button class="btn btn-outline-light p-2" type="button" style="min-width:68px" onclick="window.incrementFrequency && window.incrementFrequency(10)">+10</button> 
                                        <div class="input-group-text text-muted" style="min-width:120px">20 - 70 Hz</div>
                                        <button class="btn btn-outline-danger p-2 ms-4" type="button" onclick="window.resetFrequency && window.resetFrequency()"><span class="bi bi-arrow-clockwise"></span></button>
                                    </div>
                                </div>
                            </div>
                            <!-- Offcanvas for Current -->
                            <div class="offcanvas offcanvas-bottom" style="height:45vh" data-bs-backdrop="false" tabindex="-1" id="${offcanvasId('current')}" aria-labelledby="${offcanvasId('current')}_label">
                                <div class="offcanvas-header py-1" style="min-height:32px;max-height:38px;">
                                    <h5 class="offcanvas-title py-1 fs-6" id="${offcanvasId('current')}_label">Set Current (L${idx + 1})</h5>
                                    <button type="button" class="btn-close text-reset" data-bs-dismiss="offcanvas" aria-label="Close"></button>
                                </div>
                                <div class="offcanvas-body d-flex flex-column align-items-center p-2" style="overflow-y:hidden;">
                                    <div class="input-group mb-2 justify-content-start">
                                        <div class="input-group-text fs-5" style="min-width:40px">I</div>
                                        <button class="btn btn-outline-warning p-2" type="button" style="min-width:68px" onclick="window.incrementCurrent && window.incrementCurrent(${idx}, -1)">-1</button>
                                        <button class="btn btn-outline-warning p-2" type="button" style="min-width:68px" onclick="window.incrementCurrent && window.incrementCurrent(${idx}, -0.1)">-0.1</button>
                                        <button class="btn btn-outline-warning p-2" type="button" style="min-width:68px" onclick="window.incrementCurrent && window.incrementCurrent(${idx}, -0.01)">-0.01</button>
                                        <input type="text" class="form-control text-center mx-1 fs-5" style="width:90px;max-width:90px;" id="current_input_${idx}" value="${scaledAmplitudeB.toFixed(2)}" onblur="window.setCurrentDirect && window.setCurrentDirect(${idx}, this.value)" onkeydown="if(event.key==='Enter'){window.setCurrentDirect && window.setCurrentDirect(${idx}, this.value)}">
                                        <button class="btn btn-outline-warning p-2" type="button" style="min-width:68px" onclick="window.incrementCurrent && window.incrementCurrent(${idx}, 0.01)">+0.01</button>
                                        <button class="btn btn-outline-warning p-2" type="button" style="min-width:68px" onclick="window.incrementCurrent && window.incrementCurrent(${idx}, 0.1)">+0.1</button>
                                        <button class="btn btn-outline-warning p-2" type="button" style="min-width:68px" onclick="window.incrementCurrent && window.incrementCurrent(${idx}, 1)">+1</button>
                                        <div class="input-group-text text-muted" style="min-width:120px">0 - 10 A<sub>rms</sub></div>
                                        <button class="btn btn-outline-danger p-2 ms-4" type="button" onclick="window.resetCurrent && window.resetCurrent(${idx})"><span class="bi bi-arrow-clockwise"></span></button>
                                    </div>
                                    <div class="input-group mb-2 justify-content-start">
                                        <div class="input-group-text fs-5" style="min-width:40px">&Phi;</div>
                                        <button class="btn btn-outline-light p-2" type="button" style="min-width:68px" onclick="window.incrementPhase && window.incrementPhase(${idx}, 'b', -10)">-10</button>
                                        <button class="btn btn-outline-light p-2" type="button" style="min-width:68px" onclick="window.incrementPhase && window.incrementPhase(${idx}, 'b', -1)">-1</button>
                                        <button class="btn btn-outline-light p-2" type="button" style="min-width:68px" onclick="window.incrementPhase && window.incrementPhase(${idx}, 'b', -0.1)">-0.1</button>
                                        <input type="text" class="form-control text-center mx-1 fs-5" style="width:90px;max-width:90px;" id="phase_b_input_${idx}" value="${synth.phase_b.toFixed(1)}" onblur="window.setPhaseDirect && window.setPhaseDirect(${idx}, 'b', this.value)" onkeydown="if(event.key==='Enter'){window.setPhaseDirect && window.setPhaseDirect(${idx}, 'b', this.value)}">
                                        <button class="btn btn-outline-light p-2" type="button" style="min-width:68px" onclick="window.incrementPhase && window.incrementPhase(${idx}, 'b', 0.1)">+0.1</button>
                                        <button class="btn btn-outline-light p-2" type="button" style="min-width:68px" onclick="window.incrementPhase && window.incrementPhase(${idx}, 'b', 1)">+1</button>
                                        <button class="btn btn-outline-light p-2" type="button" style="min-width:68px" onclick="window.incrementPhase && window.incrementPhase(${idx}, 'b', 10)">+10</button>
                                        <div class="input-group-text text-muted" style="min-width:120px">0 - 360 °</div>
                                        <button class="btn btn-outline-danger p-2 ms-4" type="button" onclick="window.resetPhase && window.resetPhase(${idx}, 'b')"><span class="bi bi-arrow-clockwise"></span></button>
                                    </div>
                                    <div class="input-group mb-2 justify-content-start">
                                        <div class="input-group-text fs-5" style="min-width:40px">&#131;</div>
                                        <button class="btn btn-outline-light p-2" type="button" style="min-width:68px" onclick="window.incrementFrequency && window.incrementFrequency(-10)">-10</button>
                                        <button class="btn btn-outline-light p-2" type="button" style="min-width:68px" onclick="window.incrementFrequency && window.incrementFrequency(-1)">-1</button>
                                        <button class="btn btn-outline-light p-2" type="button" style="min-width:68px" onclick="window.incrementFrequency && window.incrementFrequency(-0.1)">-0.1</button>
                                        <input type="text" class="form-control text-center mx-1 fs-5" style="width:90px;max-width:90px;" id="frequency_b_input_${idx}" value="${synth.frequency_b?.toFixed(1) ?? ''}" onblur="window.setFrequencyDirect && window.setFrequencyDirect(${idx}, 'b', this.value)" onkeydown="if(event.key==='Enter'){window.setFrequencyDirect && window.setFrequencyDirect(${idx}, 'b', this.value)}">
                                        <button class="btn btn-outline-light p-2" type="button" style="min-width:68px" onclick="window.incrementFrequency && window.incrementFrequency(0.1)">+0.1</button>
                                        <button class="btn btn-outline-light p-2" type="button" style="min-width:68px" onclick="window.incrementFrequency && window.incrementFrequency(1)">+1</button>
                                        <button class="btn btn-outline-light p-2" type="button" style="min-width:68px" onclick="window.incrementFrequency && window.incrementFrequency(10)">+10</button>
                                        <div class="input-group-text text-muted" style="min-width:120px">20 - 70 Hz</div>
                                        <button class="btn btn-outline-danger p-2 ms-4" type="button" onclick="window.resetFrequency && window.resetFrequency()"><span class="bi bi-arrow-clockwise"></span></button>
                                    </div>
                                </div>
                            </div>

                            <!-- Offcanvas for Frequency -->
                            <div class="offcanvas offcanvas-bottom" data-bs-backdrop="false" tabindex="-1" id="${offcanvasId('frequency')}" aria-labelledby="${offcanvasId('frequency')}_label">
                                <div class="offcanvas-header py-1" style="min-height:32px;max-height:38px;">
                                    <h5 class="offcanvas-title py-1 fs-6" id="${offcanvasId('frequency')}_label">Set Frequency (L${idx + 1})</h5>
                                    <button type="button" class="btn-close text-reset" data-bs-dismiss="offcanvas" aria-label="Close"></button>
                                </div>
                                <div class="offcanvas-body d-flex flex-column align-items-center p-2" style="overflow-y:hidden;">
                                    <div class="input-group mb-3 justify-content-center">
                                        <button class="btn btn-outline-light px-2 py-1 p-2" type="button" style="min-width:68px" onclick="window.incrementFrequency && window.incrementFrequency(${idx}, -10)">-10</button>
                                        <button class="btn btn-outline-light px-2 py-1 p-2" type="button" style="min-width:68px" onclick="window.incrementFrequency && window.incrementFrequency(${idx}, -1)">-1</button>
                                        <button class="btn btn-outline-light px-2 py-1 p-2" type="button" style="min-width:68px" onclick="window.incrementFrequency && window.incrementFrequency(${idx}, -0.1)">-0.1</button>
                                        <input type="text" class="form-control text-center mx-1 fs-4" style="width:90px;max-width:90px;" id="frequency_input_${idx}" value="${synth.frequency_a}" onblur="window.setFrequencyDirect && window.setFrequencyDirect(${idx}, this.value)" onkeydown="if(event.key==='Enter'){window.setFrequencyDirect && window.setFrequencyDirect(${idx}, this.value)}">
                                        <button class="btn btn-outline-light px-2 py-1 p-2" type="button" style="min-width:68px" onclick="window.incrementFrequency && window.incrementFrequency(${idx}, 0.1)">+0.1</button>
                                        <button class="btn btn-outline-light px-2 py-1 p-2" type="button" style="min-width:68px" onclick="window.incrementFrequency && window.incrementFrequency(${idx}, 1)">+1</button>
                                        <button class="btn btn-outline-light px-2 py-1 p-2" type="button" style="min-width:68px" onclick="window.incrementFrequency && window.incrementFrequency(${idx}, 10)">+10</button>
                                    </div>
                                    <div class="text-muted fs-5">(Hz)</div>
                                </div>
                            </div>
                        </div>
                        <div class="col">
                            <canvas id="${chartCanvasId}" width="220" height="80" style="display:block;margin:auto;"></canvas>
                        </div>
                    </div>
                    <div class="row">
                        <div class="col-6 pe-1">
                            <div class="fw-semibold">Voltage</div>
                            <table class="table table-sm table-borderless text-muted">
                                <tbody>
                                    ${renderHarmonics(synth.harmonics_a)}
                                </tbody>
                            </table>
                        </div>
                        <div class="col-6 ps-1">
                            <div class="fw-semibold">Current</div>
                            <table class="table table-sm table-borderless text-muted">
                                <tbody>
                                    ${renderHarmonics(synth.harmonics_b)}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

export function SynthCardsRow(AppState) {
    const { synths } = AppState.synthstate
    if (!synths || synths.length === 0) {
        return `<div class="col"><div class="alert alert-info">No synths available.</div></div>`;
    }
    const phaseLabels = ['L1', 'L2', 'L3'];
    return `
    <div class="accordion" id="synthAccordion">
        ${synths.map((synth, idx) => SynthAccordionItem({ synth, idx, phaseLabel: phaseLabels[idx] }, AppState)).join('')}
    </div>
`;
}

export function LoadingSpinner() {
    return '<div class="col"><div class="alert alert-info">Waiting for data...</div></div>';
}
