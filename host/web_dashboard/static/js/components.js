// UI Component and rendering functions for NHP Synth Dashboard
// Exported as ES module

export function CombinedWaveformChart(synth, canvasId) {
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
        let y = peak * Math.sin(2 * Math.PI * frequencyA/40 * t + (phase * Math.PI / 180));
        if (Array.isArray(harmonics)) {scaledAmplitudeA 
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
                    order: 2
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
                    order: 1
                }
            ]
        },
        options: {
            responsive: false,
            animation: false,
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false }
            },
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

window.selectedInputGroup = { idx: null, channel: null, type: null };

window.setSelectedInputGroup = function(idx, channel, type) {
    window.selectedInputGroup = { idx, channel, type };
    document.querySelectorAll('.selectable-input-group').forEach(e => {
        e.classList.remove('selected');
    });

    const selId = type === 'voltage' ? `voltage_input_${idx}` :
                  type === 'current' ? `current_input_${idx}` :
                  type === 'phase' ? `phase_input_${idx}_${channel}` :
                  type === 'frequency' ? `frequency_input_${idx}` : null;

    if (selId) {
        const group = document.getElementById(selId)?.closest('.selectable-input-group');
        if (group) {
            group.classList.add('selected');
        }
    }
    document.getElementById(`increment_buttons_${idx}`).innerHTML = renderIncrementButtons();
};

window.clearSelectedInputGroup = function() {
    window.selectedInputGroup = { idx: null, channel: null, type: null };
    document.querySelectorAll('.selectable-input-group').forEach(e => {
        e.classList.remove('selected');
    });
};

window.incrementSelectedInputGroup = function(delta) {
    const { idx, channel, type } = window.selectedInputGroup;
    if (idx === null || !type) return;
    if (type === 'voltage' && window.incrementVoltage) window.incrementVoltage(idx, delta);
    if (type === 'current' && window.incrementCurrent) window.incrementCurrent(idx, delta);
    if (type === 'phase' && window.incrementPhase) window.incrementPhase(idx, channel, delta);
    if (type === 'frequency' && window.incrementFrequency) window.incrementFrequency(delta);
};

window.resetSelectedInputGroup = function() {
    const { idx, channel, type } = window.selectedInputGroup;
    if (idx === null || !type) return;
    if (type === 'voltage' && window.resetVoltage) window.resetVoltage(idx);
    if (type === 'current' && window.resetCurrent) window.resetCurrent(idx);
    if (type === 'phase' && window.resetPhase) window.resetPhase(idx, channel);
    if (type === 'frequency' && window.resetFrequency) window.resetFrequency();
};

function renderIncrementButtons() {
    // Store current adjustment index in window
    if (window.incrementAdjustmentIndex === undefined) window.incrementAdjustmentIndex = 0;
    const multiplier = (window.selectedInputGroup.type === 'current') ? 0.1 : 1;

    function round(val) {return +val.toFixed(3);}

    // Adjustment levels
    const adjustmentLevels = [
        { label: "Coarse", value: round(multiplier * 10) },
        { label: "Fine", value: round(multiplier * 1) },
        { label: "Very Fine" , value: round(multiplier * 0.1) }
    ];

    const adjustment = adjustmentLevels[window.incrementAdjustmentIndex];

    // Toggle function
    window.toggleIncrementAdjustment = function() {
        window.incrementAdjustmentIndex = (window.incrementAdjustmentIndex + 1) % adjustmentLevels.length;
        // Re-render buttons if needed
        document.querySelectorAll('[id^="increment_buttons_"]').forEach(e => {
            if (typeof window.selectedInputGroup.idx === 'number') {
                e.innerHTML = renderIncrementButtons();
            }
        });
    };

    return `
        <div class="d-flex flex-column gap-2">
            <button class="btn btn-outline-info p-2 btn-lg" type="button"
                onclick="window.incrementSelectedInputGroup(${round(adjustment.value)})">
                <span class="bi bi-arrow-up"></span>
            </button>
            <button class="btn btn-outline-info p-2 btn-lg" type="button"
                onclick="window.incrementSelectedInputGroup(${round(-adjustment.value)})">
                <span class="bi bi-arrow-down"></span>
            </button>
            <div class="d-flex flex-row gap-2">
                <button class="btn btn-outline-light p-2 w-50" type="button"
                    onclick="window.toggleIncrementAdjustment()">
                    <i class="bi bi-plus-slash-minus"></i> ${adjustment.value}
                </button>
                <button class="btn btn-outline-danger p-2 w-50" type="button"
                    onclick="window.resetSelectedInputGroup()">
                    <span class="bi bi-arrow-clockwise"></span>
                </button>
            </div>
        </div>
    `;
};

// listener for offcanvas close events
document.addEventListener('hidden.bs.offcanvas', function(event) {
    window.clearSelectedInputGroup();
});

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
    const voltageSelected = highlightIfSelected('voltage', idx, 'a') ? 'highlighted' : '';
    const currentSelected = highlightIfSelected('current', idx, 'b') ? 'highlighted' : '';
    const phaseSelected = (highlightIfSelected('phase', idx, 'a') || highlightIfSelected('phase', idx, 'b')) ? 'highlighted' : '';
    const frequencySelected = highlightIfSelected('frequency', idx, 'all') ? 'highlighted' : '';

    return `
        <div class="accordion-item bg-transparent border-0">
            <style>
                .selected {
                    outline: 2px solid var(--bs-info);
                    border-radius: 0.375rem;
                    box-shadow: 0 0 0.5rem var(--bs-info);
                }
                .highlighted {
                    position: relative;
                    font-weight: bold;
                    color: inherit;
                }
                .highlighted::before {
                        content: '';
                        position: absolute;
                        left: 10px; top: -5px; right: -5px; bottom: -5px;
                        border: 2px solid var(--bs-info);
                        border-radius: 0.25em;
                        pointer-events: none;
                        box-sizing: border-box;
                }
            </style>
            <h2 class="accordion-header" id="${headingId}">
                <button class="accordion-button collapsed py-2" type="button" data-bs-toggle="collapse" data-bs-target="#${collapseId}" aria-expanded="false" aria-controls="${collapseId}">
                    <div class="col-1 fw-bold">${phase}</div>
                    <div class="col-2 text-end ${frequencySelected}">${freqDisplay}</div>
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
                <div class="accordion-body bg-dark py-2">
                    <div class="row">
                        <div class="col py-2">
                            <canvas id="${chartCanvasId}" width="340" height="80" style="display:block;margin:auto;cursor:pointer;" data-bs-toggle="offcanvas" data-bs-target="#${offcanvasId('waveform')}"></canvas>
                        </div>
                    </div>
                    <div class="row">
                        <div class="col-6 pe-1">
                            <button class="btn btn-outline-info w-100" type="button" id="harmonics_a_btn_${idx}" data-bs-toggle="offcanvas" data-bs-target="#harmonics_a_offcanvas_${idx}">
                                <table class="table table-sm table-borderless mb-0">
                                    <tbody>
                                        ${renderHarmonics(synth.harmonics_a)}
                                    </tbody>
                                </table>
                            </button>
                        </div>
                        <div class="col-6 ps-1">
                            <button class="btn btn-outline-warning w-100" type="button" id="harmonics_b_btn_${idx}" data-bs-toggle="offcanvas" data-bs-target="#harmonics_b_offcanvas_${idx}">
                                <table class="table table-sm table-borderless mb-0">
                                    <tbody>
                                        ${renderHarmonics(synth.harmonics_b)}
                                    </tbody>
                                </table>
                            </button>
                        </div>
                    </div>
                    <!-- Offcanvas for Waveform -->
                    <div class="offcanvas offcanvas-bottom" style="height:45vh" data-bs-backdrop="false" tabindex="-1" id="${offcanvasId('waveform')}" aria-labelledby="${offcanvasId('waveform')}_label">
                        <div class="offcanvas-header py-1" style="min-height:32px;max-height:38px;">
                            <h5 class="offcanvas-title py-1 fs-6" id="${offcanvasId('waveform')}_label">Set Waveform (L${idx + 1})</h5>
                            <button type="button" class="btn-close text-reset" data-bs-dismiss="offcanvas" aria-label="Close"></button>
                        </div>
                        <div class="offcanvas-body p-2" style="overflow-y:hidden; overflow-x:hidden;">
                            <div class="row justify-content-center px-2">
                                <div class="col-auto">
                                    <div class="row">
                                        <div class="col-6">
                                            <div class="input-group mb-2 justify-content-center selectable-input-group" tabindex="0" id="voltage_group_${idx}" onclick="window.setSelectedInputGroup && window.setSelectedInputGroup(${idx}, 'a', 'voltage')">
                                                <div class="input-group-text fs-4 justify-content-center" style="min-width:68px; font-style:italic; font-family:Cambria;">V</div>
                                                <input type="text" class="form-control text-center fs-5" style="width:90px;max-width:90px;" id="voltage_input_${idx}" value="${scaledAmplitudeA.toFixed(1)}" onblur="window.setVoltageDirect && window.setVoltageDirect(${idx}, this.value)" onkeydown="if(event.key==='Enter'){window.setVoltageDirect && window.setVoltageDirect(${idx}, this.value)}">
                                                <div class="input-group-text text-muted" style="min-width:120px">0 - 240 V<sub>rms</sub></div>
                                            </div>
                                        </div>
                                        <div class="col-6">
                                            <div class="input-group mb-2 justify-content-center selectable-input-group" tabindex="0" id="current_group_${idx}" onclick="window.setSelectedInputGroup && window.setSelectedInputGroup(${idx}, 'b', 'current')">
                                                <div class="input-group-text fs-4 justify-content-center" style="min-width:68px; font-style:italic; font-family:Cambria;">I</div>
                                                <input type="text" class="form-control text-center fs-5" style="width:90px;max-width:90px;" id="current_input_${idx}" value="${scaledAmplitudeB.toFixed(2)}" onblur="window.setCurrentDirect && window.setCurrentDirect(${idx}, this.value)" onkeydown="if(event.key==='Enter'){window.setCurrentDirect && window.setCurrentDirect(${idx}, this.value)}">
                                                <div class="input-group-text text-muted" style="min-width:120px">0 - 10 A<sub>rms</sub></div>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="row">
                                        <div class="col-6">
                                            <div class="input-group mb-2 justify-content-center selectable-input-group" tabindex="0" id="phase_a_group_${idx}" onclick="window.setSelectedInputGroup && window.setSelectedInputGroup(${idx}, 'a', 'phase')">
                                                <div class="input-group-text fs-4 justify-content-center" style="min-width:68px; font-style:italic; font-family: Cambria;">&Phi;<sub>V</sub></div>
                                                <input type="text" class="form-control text-center fs-5" style="width:90px;max-width:90px;" id="phase_input_${idx}" value="${synth.phase_a.toFixed(1)}" onblur="window.setPhaseDirect && window.setPhaseDirect(${idx}, 'a', this.value)" onkeydown="if(event.key==='Enter'){window.setPhaseDirect && window.setPhaseDirect(${idx}, 'a', this.value)}">
                                                <div class="input-group-text text-muted" style="min-width:120px">0 - 360 °</div>
                                            </div>
                                        </div>
                                        <div class="col-6">
                                            <div class="input-group mb-2 justify-content-center selectable-input-group" tabindex="0" id="phase_b_group_${idx}" onclick="window.setSelectedInputGroup && window.setSelectedInputGroup(${idx}, 'b', 'phase')">
                                                <div class="input-group-text fs-4 justify-content-center" style="min-width:68px; font-style:italic; font-family: Cambria;">&Phi;<sub>I</sub></div>
                                                <input type="text" class="form-control text-center fs-5" style="width:90px;max-width:90px;" id="phase_input_${idx}" value="${synth.phase_b.toFixed(1)}" onblur="window.setPhaseDirect && window.setPhaseDirect(${idx}, 'b', this.value)" onkeydown="if(event.key==='Enter'){window.setPhaseDirect && window.setPhaseDirect(${idx}, 'b', this.value)}">
                                                <div class="input-group-text text-muted" style="min-width:120px">0 - 360 °</div>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="row justify-content-center">
                                        <div class="col-6">
                                            <div class="input-group mb-2 justify-content-center selectable-input-group" tabindex="0" id="frequency_group_${idx}" onclick="window.setSelectedInputGroup && window.setSelectedInputGroup(${idx}, 'a', 'frequency')">
                                                <div class="input-group-text fs-4 justify-content-center" style="min-width:68px; font-style:italic; font-family: Cambria;">f</div>
                                                <input type="text" class="form-control text-center fs-5" style="width:90px;max-width:90px;" id="frequency_input_${idx}" value="${synth.frequency_a.toFixed(1)}" onblur="window.setFrequencyDirect && window.setFrequencyDirect(${idx}, this.value)" onkeydown="if(event.key==='Enter'){window.setFrequencyDirect && window.setFrequencyDirect(${idx}, this.value)}">
                                                <div class="input-group-text text-muted" style="min-width:120px">20 - 70 Hz</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div class="col">
                                    <div class="row">
                                        <div class="col" id="increment_buttons_${idx}">
                                            ${renderIncrementButtons()}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <!-- Offcanvas for Harmonics -->
                    <div class="offcanvas offcanvas-bottom" style="height:50vh" tabindex="-1" id="harmonics_a_offcanvas_${idx}" aria-labelledby="harmonics_a_offcanvas_${idx}_label">
                        <div class="offcanvas-header py-1" style="min-height:32px;max-height:38px;">
                            <h5 class="offcanvas-title" id="harmonics_a_offcanvas_${idx}_label">Harmonics (L${idx + 1} - Voltage)</h5>
                            <button type="button" class="btn-close text-reset" data-bs-dismiss="offcanvas" aria-label="Close"></button>
                        </div>
                        <div class="offcanvas-body d-flex flex-column align-items-center p-2" style="overflow-y:hidden;">
                            <div class="mb-2 text-center">
                                ${[0,1,2,3].map(i => {
                                    const h = synth.harmonics_a?.[i];
                                    return `
                                    <div class="input-group mb-2 justify-content-center">
                                        <span class="input-group-text" style="min-width:68px">Order</span>
                                        <input type="number" class="form-control text-center" min="3" step="2" max="99" style="width:70px" value="${h?.order ?? ''}" id="harmonics_a_order_${idx}_${i}" oninput="window.validateHarmonicOrder && window.validateHarmonicOrder(${idx}, 'a', ${i}, this.value)">
                                        <span class="input-group-text" style="min-width:68px">%</span>
                                        <input type="number" class="form-control text-center" min="0" max="100" style="width:70px" value="${h?.amplitude ?? ''}" id="harmonics_a_amp_${idx}_${i}" oninput="window.validateHarmonicAmplitude && window.validateHarmonicAmplitude(${idx}, 'a', ${i}, this.value)">
                                        <span class="input-group-text" style="min-width:68px">&Phi;</span>
                                        <input type="number" class="form-control text-center" min="0" max="360" style="width:70px" value="${h?.phase ?? ''}" id="harmonics_a_phase_${idx}_${i}" oninput="window.validateHarmonicPhase && window.validateHarmonicPhase(${idx}, 'a', ${i}, this.value)">
                                        <button class="btn btn-outline-danger" type="button" onclick="window.removeHarmonic && window.removeHarmonic(${idx}, 'a', ${i})"><span class="bi bi-x"></span></button>
                                    </div>`;
                                }).join('')}
                            </div>
                            <div class="text-muted small">Order must be odd, ≥3, and unique. %: 0-100, Phase: 0-360°</div>
                         </div>
                    </div>
                    <!-- Offcanvas for Harmonics B -->
                    <div class="offcanvas offcanvas-bottom" style="height:50vh" tabindex="-1" id="harmonics_b_offcanvas_${idx}" aria-labelledby="harmonics_b_offcanvas_${idx}_label">
                        <div class="offcanvas-header">
                            <h5 class="offcanvas-title" id="harmonics_b_offcanvas_${idx}_label">Harmonics (L${idx + 1} - Current)</h5>
                            <button type="button" class="btn-close text-reset" data-bs-dismiss="offcanvas" aria-label="Close"></button>
                        </div>
                        <div class="offcanvas-body d-flex flex-column align-items-center p-2" style="overflow-y:hidden;">
                            <div class="mb-2 text-center">
                                ${[0,1,2,3].map(i => {
                                    const h = synth.harmonics_b?.[i];
                                    return `
                                    <div class="input-group mb-2 justify-content-center">
                                        <span class="input-group-text" style="min-width:68px">Order</span>
                                        <input type="number" class="form-control text-center" min="3" step="2" max="99" style="width:70px" value="${h?.order ?? ''}" id="harmonics_b_order_${idx}_${i}" oninput="window.validateHarmonicOrder && window.validateHarmonicOrder(${idx}, 'b', ${i}, this.value)">
                                        <span class="input-group-text" style="min-width:68px">%</span>
                                        <input type="number" class="form-control text-center" min="0" max="100" style="width:70px" value="${h?.amplitude ?? ''}" id="harmonics_b_amp_${idx}_${i}" oninput="window.validateHarmonicAmplitude && window.validateHarmonicAmplitude(${idx}, 'b', ${i}, this.value)">
                                        <span class="input-group-text" style="min-width:68px">&Phi;</span>
                                        <input type="number" class="form-control text-center" min="0" max="360" style="width:70px" value="${h?.phase ?? ''}" id="harmonics_b_phase_${idx}_${i}" oninput="window.validateHarmonicPhase && window.validateHarmonicPhase(${idx}, 'b', ${i}, this.value)">
                                        <button class="btn btn-outline-danger" type="button" onclick="window.removeHarmonic && window.removeHarmonic(${idx}, 'b', ${i})"><span class="bi bi-x"></span></button>
                                    </div>`;
                                }).join('')}
                            </div>
                            <div class="text-muted small">Order must be odd, ≥3, and unique. %: 0-100, Phase: 0-360°</div>
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
