// UI Component and rendering functions for NHP Synth Dashboard
// Exported as ES module

function harmonicOffCanvas(synth, idx, channel) {
    return `
        <div class="offcanvas offcanvas-bottom" data-bs-backdrop="false" style="height:50vh" tabindex="-1" id="harmonics_${channel}_offcanvas_${idx}" aria-labelledby="harmonics_${channel}_offcanvas_${idx}_label">
            <div class="offcanvas-header py-1" style="min-height:32px;max-height:38px;">
                <h5 class="offcanvas-title" id="harmonics_${channel}_offcanvas_${idx}_label">Harmonics (L${idx + 1} - ${channel === 'a' ? 'Voltage' : 'Current'})</h5>
                <button type="button" class="btn-close text-reset" data-bs-dismiss="offcanvas" aria-label="Close"></button>
            </div>
            <div class="offcanvas-body p-2" style="overflow-y:hidden;overflow-x:hidden;">
                <div class="row justify-content-center px-2">
                    <div class="col-auto">
                        <table class="table table-sm table-bordered mb-2 text-center" style="min-width:320px">
                            <thead>
                                <tr>
                                    <th>Order</th>
                                    <th>%</th>
                                    <th>&Phi;</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${[0,1,2,3].map(i => {
                                    const harmonics = channel === 'a' ? synth.harmonics_a : synth.harmonics_b;
                                    let h = null;
                                    if (Array.isArray(harmonics)) {
                                        h = harmonics.find(hh => hh.id === i);
                                    }
                                    const cellStyle = 'style="width:80px;min-width:80px;max-width:80px;"';
                                    return `<tr>
                                        <td class="selectable" ${cellStyle} tabindex="0" id="harmonic_${channel}_order_${i}_${idx}" onclick="setSelected(${idx}, '${channel}', 'harmonic_order_${i}')">${h ? h.order : '&mdash;'}</td>
                                        <td class="selectable" ${cellStyle} tabindex="0" id="harmonic_${channel}_amp_${i}_${idx}" onclick="setSelected(${idx}, '${channel}', 'harmonic_amp_${i}')">${h ? h.amplitude : '&mdash;'}</td>
                                        <td class="selectable" ${cellStyle} tabindex="0" id="harmonic_${channel}_phase_${i}_${idx}" onclick="setSelected(${idx}, '${channel}', 'harmonic_phase_${i}')">${h ? h.phase : '&mdash;'}</td>
                                    </tr>`;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                    <div class="col" id="increment_buttons_harmonics_${channel}_${idx}">
                        ${incrementButtons()}
                    </div>
                </div>
            </div>
        </div>
        `;
}

// listener for offcanvas close events
document.addEventListener('hidden.bs.offcanvas', function(event) {
    window.clearSelected();
});

function synthAccordionItem({ synth, idx, phaseLabel }, AppState) {
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

    let selectionMode = (AppState.synthState.selectionMode) ? AppState.synthState.selectionMode : {};

    function highlightIfSelected(func, synthIdx, channel) {
        const mode = selectionMode[func];
        if (!mode) return '';
        if (mode.synth === 'all') return '';
        if (mode.synth === synthIdx && (mode.ch === 'all' || mode.ch === channel)) return true;
        return false;
    }

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
                    border: 2px solid var(--bs-info);
                    border-radius: 0.25em;
                    pointer-events: none;
                    box-sizing: border-box;
                }
                .highlighted.btn::before {
                    left: -10px; top: -10px; right: -10px; bottom: -10px;
                }
                .highlighted:not(.btn)::before {
                    left: 10px; top: -5px; right: -5px; bottom: -5px;
                }
            </style>
            <h2 class="accordion-header" id="${headingId}">
                <button class="accordion-button collapsed py-2" type="button" data-bs-toggle="collapse" data-bs-target="#${collapseId}" aria-expanded="false" aria-controls="${collapseId}">
                    <div class="col-1 fw-bold">${phase}</div>
                    <div class="col-auto text-end ${highlightIfSelected('frequency', idx, 'all') ? 'highlighted' : ''}">${freqDisplay}</div>
                    <div class="col-5 pe-3">
                        <div class="row text-info">
                            <div class="col text-end pe-0 ${highlightIfSelected('voltage', idx, 'a') ? 'highlighted' : ''}">${scaledAmplitudeA.toFixed(1)} V</div>
                            <div class="col-1 text-end p-0">&ang;</div>
                            <div class="col-3 text-start ps-1 ${highlightIfSelected('phase', idx, 'a') ? 'highlighted' : ''}">${synth.phase_a + '°'}</div>
                        </div>
                        <div class="row text-warning">
                            <div class="col text-end pe-0 ${highlightIfSelected('current', idx, 'b') ? 'highlighted' : ''}">${scaledAmplitudeB.toFixed(2)} A</div>
                            <div class="col-1 text-end p-0">&ang;</div>
                            <div class="col-3 text-start ps-1 ${highlightIfSelected('phase', idx, 'b') ? 'highlighted' : ''}">${synth.phase_b + '°'}</div>
                        </div>
                    </div>
                    <div class="col pe-1 text-end">
                        <div class="row text-light">
                            <div class="col text-light small">PF ${truePF(synth.phase_a, synth.phase_b, synth.harmonics_b).toFixed(3)}</div>
                        </div>
                        <div class="row text-light">
                            <div class="col text-light small">THD<sub>i</sub> ${(THD(synth.harmonics_b)).toFixed(3)}</div>
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
                            <button class="btn btn-outline-info w-100 ${highlightIfSelected('harmonics', idx, 'a') ? 'highlighted' : ''}" type="button" id="harmonics_a_btn_${idx}" data-bs-toggle="offcanvas" data-bs-target="#harmonics_a_offcanvas_${idx}">
                                <table class="table table-sm table-borderless mb-0">
                                    <tbody>
                                        ${harmonicsCells(synth.harmonics_a)}
                                    </tbody>
                                </table>
                            </button>
                        </div>
                        <div class="col-6 ps-1}">
                            <button class="btn btn-outline-warning w-100 ${highlightIfSelected('harmonics', idx, 'b') ? 'highlighted' : ''}" type="button" id="harmonics_b_btn_${idx}" data-bs-toggle="offcanvas" data-bs-target="#harmonics_b_offcanvas_${idx}">
                                <table class="table table-sm table-borderless mb-0">
                                    <tbody>
                                        ${harmonicsCells(synth.harmonics_b)}
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
                                            <div class="input-group mb-2 justify-content-center selectable" tabindex="0" id="voltage_group_${idx}" onclick="setSelected(${idx}, 'a', 'voltage')">
                                                <div class="input-group-text fs-4 justify-content-center" style="min-width:68px; font-style:italic; font-family:Cambria;">V</div>
                                                <input type="text" class="form-control text-center fs-5" style="width:90px;max-width:90px;" id="voltage_input_${idx}" value="${scaledAmplitudeA.toFixed(1)}" onblur="setVoltageDirect(${idx}, event.target.value)" onkeydown="if(event.key==='Enter'){setVoltageDirect(${idx}, event.target.value)}">
                                                <div class="input-group-text text-muted" style="min-width:120px">0 - 240 V<sub>rms</sub></div>
                                            </div>
                                        </div>
                                        <div class="col-6">
                                            <div class="input-group mb-2 justify-content-center selectable" tabindex="0" id="current_group_${idx}" onclick="setSelected(${idx}, 'b', 'current')">
                                                <div class="input-group-text fs-4 justify-content-center" style="min-width:68px; font-style:italic; font-family:Cambria;">I</div>
                                                <input type="text" class="form-control text-center fs-5" style="width:90px;max-width:90px;" id="current_input_${idx}" value="${scaledAmplitudeB.toFixed(2)}" onblur="setCurrentDirect(${idx}, event.target.value)" onkeydown="if(event.key==='Enter'){setCurrentDirect(${idx}, event.target.value)}">
                                                <div class="input-group-text text-muted" style="min-width:120px">0 - 10 A<sub>rms</sub></div>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="row">
                                        <div class="col-6">
                                            <div class="input-group mb-2 justify-content-center selectable" tabindex="0" id="phase_a_group_${idx}" onclick="setSelected(${idx}, 'a', 'phase')">
                                                <div class="input-group-text fs-4 justify-content-center" style="min-width:68px; font-style:italic; font-family: Cambria;">&Phi;<sub>V</sub></div>
                                                <input type="text" class="form-control text-center fs-5" style="width:90px;max-width:90px;" id="phase_input_${idx}" value="${synth.phase_a.toFixed(1)}" onblur="setPhaseDirect(${idx}, 'a', event.target.value)" onkeydown="if(event.key==='Enter'){setPhaseDirect(${idx}, 'a', event.target.value)}">
                                                <div class="input-group-text text-muted" style="min-width:120px">0 - 360 °</div>
                                            </div>
                                        </div>
                                        <div class="col-6">
                                            <div class="input-group mb-2 justify-content-center selectable" tabindex="0" id="phase_b_group_${idx}" onclick="setSelected(${idx}, 'b', 'phase')">
                                                <div class="input-group-text fs-4 justify-content-center" style="min-width:68px; font-style:italic; font-family: Cambria;">&Phi;<sub>I</sub></div>
                                                <input type="text" class="form-control text-center fs-5" style="width:90px;max-width:90px;" id="phase_input_${idx}" value="${synth.phase_b.toFixed(1)}" onblur="setPhaseDirect(${idx}, 'b', event.target.value)" onkeydown="if(event.key==='Enter'){setPhaseDirect(${idx}, 'b', event.target.value)}">
                                                <div class="input-group-text text-muted" style="min-width:120px">0 - 360 °</div>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="row justify-content-center">
                                        <div class="col-6">
                                            <div class="input-group mb-2 justify-content-center selectable" tabindex="0" id="frequency_group_${idx}" onclick="setSelected(${idx}, 'a', 'frequency')">
                                                <div class="input-group-text fs-4 justify-content-center" style="min-width:68px; font-style:italic; font-family: Cambria;">f</div>
                                                <input type="text" class="form-control text-center fs-5" style="width:90px;max-width:90px;" id="frequency_input_${idx}" value="${synth.frequency_a.toFixed(1)}" onblur="setFrequencyDirect(event.target.value)" onkeydown="if(event.key==='Enter'){setFrequencyDirect(event.target.value)}">
                                                <div class="input-group-text text-muted" style="min-width:120px">20 - 70 Hz</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div class="col">
                                    <div class="row">
                                        <div class="col" id="increment_buttons_${idx}">
                                            ${incrementButtons()}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <!-- Offcanvas for Harmonics -->
                    ${harmonicOffCanvas(synth, idx, 'a')}
                    ${harmonicOffCanvas(synth, idx, 'b')}
                </div>
            </div>
        </div>
    `;
}

export function SynthCardsRow(AppState) {
    const { synths } = AppState.synthState
    if (!synths || synths.length === 0) {
        return `<div class="col"><div class="alert alert-info">No synths available.</div></div>`;
    }
    const phaseLabels = ['L1', 'L2', 'L3'];
    return `
    <div class="accordion" id="synthAccordion">
        ${synths.map((synth, idx) => synthAccordionItem({ synth, idx, phaseLabel: phaseLabels[idx] }, AppState)).join('')}
    </div>
`;
}
