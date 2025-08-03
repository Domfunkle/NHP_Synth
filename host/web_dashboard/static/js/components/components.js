// UI Component and rendering functions for NHP Synth Dashboard
// Exported as ES module

// listener for offcanvas close events
document.addEventListener('hidden.bs.offcanvas', function(event) {
    window.clearSelected();
});

function synthCardItem({ synth, idx, phaseLabel }, AppState) {
    const phase = phaseLabel || `L${idx + 1}`;
    const singlePhaseChartCanvasId = `waveform_single_phase_${idx}`;
    const scaledAmplitudeA = roundToPrecision((synth.amplitude_a / 100) * VOLTAGE_RMS_MAX, 1);
    const scaledAmplitudeB = roundToPrecision((synth.amplitude_b / 100) * CURRENT_RMS_MAX, 2);
    const offcanvasId = (type) => `offcanvas_${type}_${idx}`;

    let selectionMode = (AppState.synthState.selectionMode) ? AppState.synthState.selectionMode : {};

    function highlightIfSelected(func, synthIdx, channel) {
        const mode = selectionMode[func];
        if (!mode) return '';
        if (mode.synth === 'all') return '';
        if (mode.synth === synthIdx && (mode.ch === 'all' || mode.ch === channel)) return true;
        if (mode.synth === synthIdx && channel === 'all') return true;
        return false;
    }

    function phaseCard() {
        return `
        <div class="row" data-bs-toggle="offcanvas" data-bs-target="#${offcanvasId('waveform')}">
            <div class="col-auto px-1 bg-gradient bg-${phase}">
                <div class="fw-bold">${phase}</div>
                <div class="small">${synth.frequency_a.toFixed(1)} Hz</div>
            </div>
            <div class="col-3 px-2 text-start">
                <div class="text-${phase}-voltage">
                    <span style="white-space:pre" class="${highlightIfSelected('voltage', idx, 'a') ? 'highlighted' : ''}" id="voltageDisplay">${scaledAmplitudeA.toFixed(1).padStart(6, ' ')} V</span>
                    <span style="white-space:pre" class="${highlightIfSelected('phase', idx, 'a') ? 'highlighted' : ''}" id="phaseDisplay">&ang; ${synth.phase_a.toFixed(1).padStart(6, ' ')}°</span>
                </div>
                <div class="text-${phase}-current">
                    <span style="white-space:pre" class="${highlightIfSelected('current', idx, 'b') ? 'highlighted' : ''}" id="currentDisplay">${scaledAmplitudeB.toFixed(2).padStart(6, ' ')} A</span>
                    <span style="white-space:pre" class="${highlightIfSelected('phase', idx, 'b') ? 'highlighted' : ''}" id="phaseDisplay">&ang; ${synth.phase_b.toFixed(1).padStart(6, ' ')}°</span>
                </div>
                
            </div>
            <div class="col px-2 text-center">
                <div class="text-${phase}-voltage ${highlightIfSelected('harmonics', idx, 'a') ? 'highlighted' : ''}" style="white-space:pre">THD<sub>V</sub> ${Math.abs(THD(synth.harmonics_a)*100).toFixed(1).padStart(5,' ')} %</div>
                <div class="text-${phase}-current ${highlightIfSelected('harmonics', idx, 'b') ? 'highlighted' : ''}" style="white-space:pre">THD<sub>I</sub> ${Math.abs(THD(synth.harmonics_b)*100).toFixed(1).padStart(5,' ')} %</div>
            </div>
            <div class="col px-2  text-center">
                <div style="white-space:pre">cos&phi; ${Math.abs(DPF(synth.phase_a, synth.phase_b)).toFixed(3).padStart(5,' ')}</div>
                <div style="white-space:pre">PF   ${Math.abs(truePF(synth.phase_a, synth.phase_b, synth.harmonics_b)).toFixed(3).padStart(5,' ')}</div>
            </div>
            <div class="col px-2  text-center">
                <div style="white-space:pre">S ${(0.001 * apparentPower(synth.amplitude_a * (VOLTAGE_RMS_MAX/100), synth.amplitude_b * (CURRENT_RMS_MAX/100))).toFixed(3) + (" kVA").padEnd(5,' ')}</div>
                <div>Q ${(0.001 * reactivePower(synth.amplitude_a * (VOLTAGE_RMS_MAX/100), synth.amplitude_b * (CURRENT_RMS_MAX/100), synth.phase_a, synth.phase_b, synth.harmonics_b)).toFixed(3) + (" kVAr").padEnd(5,' ')}</div>
            </div>
            <div class="col px-2  text-center">
                <div style="white-space:pre">P ${(0.001 * activePower(synth.amplitude_a * (VOLTAGE_RMS_MAX/100), synth.amplitude_b * (CURRENT_RMS_MAX/100), synth.phase_a, synth.phase_b, synth.harmonics_b)).toFixed(3) + (" kW").padEnd(5,' ')}</div>
            </div>
        </div>
        `;
    }

    function waveformOffCanvas() {
        return `
        <div class="offcanvas offcanvas-bottom" style="height:91vh" data-bs-backdrop="false" tabindex="-1" id="${offcanvasId('waveform')}" aria-labelledby="${offcanvasId('waveform')}_label">
            <div class="offcanvas-header py-1" style="min-height:32px;max-height:38px;">
                <h5 class="offcanvas-title py-1 fs-5" id="${offcanvasId('waveform')}_label">Set Waveform (L${idx + 1})</h5>
                <button type="button" class="btn-close text-reset" data-bs-dismiss="offcanvas" aria-label="Close"></button>
            </div>
            <div class="offcanvas-body pt-0 p-2" style="overflow-y:hidden; overflow-x:hidden;">
                <div class="row m-1 pb-1">
                    <div class="card py-1 px-3 bg-dark font-monospace">
                        ${phaseCard()}
                    </div>
                </div>
                <div class="row justify-content-center px-2">
                    
                    <div class="col-6 px-4">
                        <div class="row py-1 mb-1 border rounded">
                            <canvas id="${singlePhaseChartCanvasId}" width="360" height="80" style="display:block;margin:auto;cursor:pointer;"></canvas>
                        </div>
                        <div class="row">
                            ${harmonicOffCanvas(synth, idx, 'a')}
                            ${harmonicOffCanvas(synth, idx, 'b')}
                        </div>
                    </div>

                    <div class="col-auto vstack gap-2 px-1">
                        <div class="input-group justify-content-center selectable ${phase}-voltage" tabindex="0" id="voltage_group_${idx}" onclick="setSelected(${idx}, 'a', 'voltage')">
                            <div class="input-group-text fs-5 justify-content-center" style="width:68px; font-style:italic; font-family:Cambria;">V</div>
                            <input type="text" class="form-control text-end fs-5" style="width:90px;" id="voltage_input_${idx}" value="${scaledAmplitudeA.toFixed(1)}" onblur="setVoltageDirect(${idx}, event.target.value)" onkeydown="if(event.key==='Enter'){setVoltageDirect(${idx}, event.target.value)}">
                            <div class="input-group-text text-muted" style="width:100px">0&hellip;240 V<sub>rms</sub></div>
                        </div>

                        <div class="input-group justify-content-center selectable ${phase}-current" tabindex="0" id="current_group_${idx}" onclick="setSelected(${idx}, 'b', 'current')">
                            <div class="input-group-text fs-5 justify-content-center" style="width:68px; font-style:italic; font-family:Cambria;">I</div>
                            <input type="text" class="form-control text-end fs-5" style="width:90px;" id="current_input_${idx}" value="${scaledAmplitudeB.toFixed(2)}" onblur="setCurrentDirect(${idx}, event.target.value)" onkeydown="if(event.key==='Enter'){setCurrentDirect(${idx}, event.target.value)}">
                            <div class="input-group-text text-muted" style="width:100px">0&hellip;10 A<sub>rms</sub></div>
                        </div>

                        <div class="input-group justify-content-center selectable ${phase}-voltage" tabindex="0" id="phase_a_group_${idx}" onclick="setSelected(${idx}, 'a', 'phase')">
                            <div class="input-group-text fs-5 justify-content-center" style="width:68px; font-style:italic; font-family: Cambria;">&Phi;<sub>V</sub></div>
                            <input type="text" class="form-control text-end fs-5" style="width:90px;" id="phase_input_${idx}" value="${synth.phase_a.toFixed(1)}" onblur="setPhaseDirect(${idx}, 'a', event.target.value)" onkeydown="if(event.key==='Enter'){setPhaseDirect(${idx}, 'a', event.target.value)}">
                            <div class="input-group-text text-muted" style="width:100px">&plusmn; 180°</div>
                        </div>
                        <div class="input-group justify-content-center selectable ${phase}-current" tabindex="0" id="phase_b_group_${idx}" onclick="setSelected(${idx}, 'b', 'phase')">
                            <div class="input-group-text fs-5 justify-content-center" style="width:68px; font-style:italic; font-family: Cambria;">&Phi;<sub>I</sub></div>
                            <input type="text" class="form-control text-end fs-5" style="width:90px;" id="phase_input_${idx}" value="${synth.phase_b.toFixed(1)}" onblur="setPhaseDirect(${idx}, 'b', event.target.value)" onkeydown="if(event.key==='Enter'){setPhaseDirect(${idx}, 'b', event.target.value)}">
                            <div class="input-group-text text-muted" style="width:100px">&plusmn; 180°</div>
                        </div>

                        <div class="input-group justify-content-center selectable ${phase}-voltage" tabindex="0" id="frequency_group_${idx}" onclick="setSelected(${idx}, 'a', 'frequency')">
                            <div class="input-group-text fs-5 justify-content-center" style="width:68px; font-style:italic; font-family: Cambria;">f</div>
                            <input type="text" class="form-control text-end fs-5" style="width:90px;" id="frequency_input_${idx}" value="${synth.frequency_a.toFixed(1)}" onblur="setFrequencyDirect(event.target.value)" onkeydown="if(event.key==='Enter'){setFrequencyDirect(event.target.value)}">
                            <div class="input-group-text text-muted" style="width:100px">20&hellip;70 Hz</div>
                        </div>
                    </div>
                    <div class="col-2">
                        <div class="row" id="increment_buttons_${idx}">
                            ${incrementButtons()}
                        </div>
                    </div>
                </div>
            </div>
        </div>
        `;
    }

    function harmonicOffCanvas(synth, idx, channel) {
        const waveSub = channel === 'a' ? 'v' : 'i';
        const waveType = channel === 'a' ? 'voltage' : 'current';
    return `
        <div class="col-6 px-0">
            <table class="table table-sm mb-2 text-center border-${phase}-${waveType}">
                <thead>
                    <tr class="small py-1">
                        <th>H<sub>${waveSub}</sub></th>
                        <th>%</th>
                        <th>&Phi;</th>
                    </tr>
                </thead>
                <tbody class="table-group-divider">
                    ${[0,1,2,3].map(i => {
                        const harmonics = channel === 'a' ? synth.harmonics_a : synth.harmonics_b;
                        let h = null;
                        if (Array.isArray(harmonics)) {
                            h = harmonics.find(hh => hh.id === i);
                        }
                        const styleH = 'style="width:52px;"';
                        const styleA = 'style="width:52px;"';
                        const styleP = 'style="width:64px;"';
                        return `<tr>
                            <td class="selectable" ${styleH} tabindex="0" id="harmonic_${channel}_order_${i}_${idx}" onclick="setSelected(${idx}, '${channel}', 'harmonic_order_${i}')">${h ? h.order : '&mdash;'}</td>
                            <td class="selectable" ${styleA} tabindex="0" id="harmonic_${channel}_amp_${i}_${idx}" onclick="setSelected(${idx}, '${channel}', 'harmonic_amp_${i}')">${h ? (h.amplitude + '%') : '&mdash;'}</td>
                            <td class="selectable" ${styleP} tabindex="0" id="harmonic_${channel}_phase_${i}_${idx}" onclick="setSelected(${idx}, '${channel}', 'harmonic_phase_${i}')">${h ? (h.phase + '&deg;') : '&mdash;'}</td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>
        `;
    }

    return `
        <div class="card-header py-1"></div>
        <div class="card-body bg-dark py-1 font-monospace">
            ${phaseCard()}
            ${waveformOffCanvas()}
        </div>
    `;
}

export function SynthCards(AppState) {
    const { synths } = AppState.synthState
    if (!synths || synths.length === 0) {
        return `<div class="col"><div class="alert alert-info">No synths available.</div></div>`;
    }
    const phaseLabels = ['L1', 'L2', 'L3'];
    return `
    <div class="card">
        ${synths.map((synth, idx) => synthCardItem({ synth, idx, phaseLabel: phaseLabels[idx] }, AppState)).join('')}
    </div>
    <div class="card" style="min-height:40vh; background: #222; color: #fff;">
        <div class="card-header py-1"></div>
        <div class="card-body">
            <canvas id="waveform_three_phase" width="700" height="180" style="display:block;margin:auto;cursor:pointer;"></canvas>
        </div>
    </div>
    `;
}
