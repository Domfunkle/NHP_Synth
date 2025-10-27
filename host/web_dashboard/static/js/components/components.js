// UI Component and rendering functions for NHP Synth Dashboard
// Exported as ES module

import { getMaxVoltage, getMaxCurrent } from '../settings.js';
import { incrementButtons } from './incrementButtons.js';

// listener for offcanvas close events
document.addEventListener('hidden.bs.offcanvas', function(event) {
    window.clearSelected();
});

function synthCardItem({ synth, idx, phaseLabel }, AppState) {
    const phase = phaseLabel || `L${idx + 1}`;
    const VOLTAGE_MAX = getMaxVoltage();
    const CURRENT_MAX = getMaxCurrent();
    const scaledAmplitudeA = roundToPrecision((synth.amplitude_a / 100) * VOLTAGE_MAX, 1);
    const scaledAmplitudeB = roundToPrecision((synth.amplitude_b / 100) * CURRENT_MAX, 2);
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
            <div class="col-auto px-1 bg-gradient bg-${phase}"">
                <div class="fw-bold">${phase}</div>
                <div class="small">${synth.frequency_a.toFixed(1)} Hz</div>
            </div>
            <div class="vr mx-1 px-0"></div>
            <div class="col-3 px-0 text-start">
                <div class="text-${phase}-voltage">
                    <nobr>
                    <span class="dot mx-1 ${synth.enabled.a ? 'bg-success' : 'bg-danger'}"></span><span style="white-space:pre" class="${highlightIfSelected('voltage', idx, 'a') ? 'highlighted' : ''}" id="voltageDisplay">${scaledAmplitudeA.toFixed(1).padStart(6, ' ')} V</span>
                    <span style="white-space:pre" class="${highlightIfSelected('phase', idx, 'a') ? 'highlighted' : ''}" id="phaseDisplay">&ang; ${synth.phase_a.toFixed(1).padStart(6, ' ')}°</span>
                    </nobr>
                </div>
                <div class="text-${phase}-current">
                    <nobr>
                    <span class="dot mx-1 ${synth.enabled.b ? 'bg-success' : 'bg-danger'}"></span><span style="white-space:pre" class="${highlightIfSelected('current', idx, 'b') ? 'highlighted' : ''}" id="currentDisplay">${scaledAmplitudeB.toFixed(2).padStart(6, ' ')} A</span>
                    <span style="white-space:pre" class="${highlightIfSelected('phase', idx, 'b') ? 'highlighted' : ''}" id="phaseDisplay">&ang; ${synth.phase_b.toFixed(1).padStart(6, ' ')}°</span>
                    </nobr>
                </div>
            </div>
            <div class="vr mx-1 px-0"></div>
            <div class="col px-0 text-center">
                <div class="text-${phase}-voltage ${highlightIfSelected('harmonics', idx, 'a') ? 'highlighted' : ''}" style="white-space:pre">THD<sub>V</sub>${Math.abs(THD(synth.harmonics_a)*100).toFixed(1).padStart(5,' ')} %</div>
                <div class="text-${phase}-current ${highlightIfSelected('harmonics', idx, 'b') ? 'highlighted' : ''}" style="white-space:pre">THD<sub>I</sub>${Math.abs(THD(synth.harmonics_b)*100).toFixed(1).padStart(5,' ')} %</div>
            </div>
            <div class="vr mx-1 px-0"></div>
            <div class="col px-0 text-center">
                <div style="white-space:pre">cos&phi; ${Math.abs(DPF(synth.phase_a, synth.phase_b)).toFixed(3).padStart(5,' ')}</div>
                <div style="white-space:pre">PF   ${Math.abs(truePF(synth.phase_a, synth.phase_b, synth.harmonics_b)).toFixed(3).padStart(5,' ')}</div>
            </div>
            <div class="vr mx-1 px-0"></div>
            <div class="col px- text-center">
                <div style="white-space:pre">S ${(0.001 * apparentPower(synth.amplitude_a * (VOLTAGE_MAX/100), synth.amplitude_b * (CURRENT_MAX/100))).toFixed(3) + (" kVA").padEnd(5,' ')}</div>
                <div>Q ${(0.001 * reactivePower(synth.amplitude_a * (VOLTAGE_MAX/100), synth.amplitude_b * (CURRENT_MAX/100), synth.phase_a, synth.phase_b, synth.harmonics_b)).toFixed(3) + (" kVAr").padEnd(5,' ')}</div>
            </div>
            <div class="vr mx-1 px-0"></div>
            <div class="col px-0 text-center">
                <div style="white-space:pre">P ${(0.001 * activePower(synth.amplitude_a * (VOLTAGE_MAX/100), synth.amplitude_b * (CURRENT_MAX/100), synth.phase_a, synth.phase_b, synth.harmonics_b)).toFixed(3) + (" kW").padEnd(5,' ')}</div>
            </div>
        </div>
        `;
    }


    return `
        <div class="card-header py-1"></div>
        <div class="card-body rounded bg-dark py-1 font-monospace">
            ${phaseCard()}
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
    `;
}

export function ScopeChart(AppState) {
    const { synths } = AppState.synthState
    if (!synths || synths.length === 0) {
        return `<div class="alert alert-info">No synths available for scope display.</div>`;
    }
    
    return `
    <div class="card border-0 rounded-0">
        <div class="card-body p-2 align-items-center">
            <div class="row">
                <div class="col pe-0">
                    <div class="row">
                        <div style="height:350px; position: relative;">
                            <canvas id="waveform_three_phase"></canvas>
                            <div id="chart-drag-overlay" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; cursor: grab; z-index: 10; background: transparent;"></div>
                        </div>
                        <div class="d-none">
                            <input type="range" class="form-range" id="time-offset-slider" 
                                    min="-50" max="50" value="0" step="0.1"
                                    oninput="setTimeOffset(-parseFloat(this.value))"
                                    onchange="setTimeOffset(-parseFloat(this.value))">
                        </div>
                    </div>
                    <div class="row">
                        <div class="col-auto">
                            <div class="btn-group" role="group" aria-label="Scope Reset Controls">
                                <button type="button" class="btn btn-sm btn-outline-secondary fs-3"
                                        onclick="setCurrentOffset(0); document.getElementById('current-offset-slider').value = 0;">
                                    <i class="bi bi-arrow-clockwise">I</i>
                                </button>
                                <button type="button" class="btn btn-sm btn-outline-secondary fs-3"
                                        onclick="setVoltageOffset(0); document.getElementById('voltage-offset-slider').value = 0;">
                                    <i class="bi bi-arrow-clockwise">V</i>
                                </button>                            
                                <button type="button" class="btn btn-sm btn-outline-secondary fs-3"
                                        onclick="resetTimeOffset(); document.getElementById('time-offset-slider').value = 0;">
                                    <i class="bi bi-arrow-clockwise">H</i>
                                </button>
                            </div>
                        </div>
                        <div class="col border-start border-2">
                            <div class="btn-group gap-2" role="group" aria-label="Phase Visibility Controls">
                                ${['L1', 'L2', 'L3'].map(phase => 
                                    ['voltage', 'current'].map(type => {
                                        const label = type === 'voltage' ? 'V' : 'I';
                                        return `<button type="button"
                                                    class="btn fs-4 d-flex align-items-center justify-content-center
                                                        ${getPhaseVisibility(phase, type) ? `btn-outline-${phase}-${type}` :
                                                        'btn-outline-secondary text-muted'}"
                                                    id="toggle-phase-${phase}-${type}" 
                                                    onclick="setPhaseVisibility('${phase}', '${type}', !getPhaseVisibility('${phase}', '${type}'))"
                                                    style="width: 70px; white-space: nowrap; font-style:italic; font-family:Cambria;">
                                                    ${phase} ${label}
                                                </button>`;
                                    }).join('')
                                ).join('')}
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-auto px-2">
                    <div class="vstack gap-2">
                        <div class="hstack gap-0 justify-content-between">
                            <div class="btn-group-vertical" role="group" aria-label="Voltage Scale Controls" style="width: 55px;">
                                <button type="button" class="btn btn-outline-light fs-4 d-flex align-items-center justify-content-center"
                                        id="vertical-scale-voltage-up"
                                        style="height:50px;"
                                        onclick="stepVoltageScaleUp()">
                                    <span style="white-space: nowrap; font-style:italic; font-family:Cambria;">V<i class="bi bi-plus"></i></span>
                                </button>
                                <button type="button" class="btn btn-outline-light fs-4 d-flex align-items-center justify-content-center"
                                        id="vertical-scale-voltage-down"
                                        style="height:50px;"
                                        onclick="stepVoltageScaleDown()">
                                    <span style="white-space: nowrap; font-style:italic; font-family:Cambria;">V<i class="bi bi-dash"></i></span>
                                </button>
                            </div>
                            <div class="btn-group-vertical" role="group" aria-label="Current Scale Controls" style="width: 55px;">
                                <button type="button" class="btn btn-outline-light fs-4 d-flex align-items-center justify-content-center"
                                        id="vertical-scale-current-up"
                                        style="height:50px;"
                                        onclick="stepCurrentScaleUp()">
                                    <span style="white-space: nowrap; font-style:italic; font-family:Cambria;">I<i class="bi bi-plus"></i></span>
                                </button>
                                <button type="button" class="btn btn-outline-light fs-4 d-flex align-items-center justify-content-center"
                                        id="vertical-scale-current-down"
                                        style="height:50px;"
                                        onclick="stepCurrentScaleDown()">
                                    <span style="white-space: nowrap; font-style:italic; font-family:Cambria;">I<i class="bi bi-dash"></i></span>
                                </button>
                            </div>
                        </div>
                        <div class="hstack gap-0 justify-content-between">
                            <div class="d-flex flex-column align-items-center" style="width: 52px;">
                                <input type="range" class="form-range" id="voltage-offset-slider" 
                                        min="${-getVoltageScale() * 5}" max="${getVoltageScale() * 5}" value="${-getVoltageOffset()}" step="${getVoltageScale() * 0.1}"
                                        style="height: 230px; writing-mode: vertical-lr; direction: rtl;"
                                        oninput="setVoltageOffset(-parseFloat(this.value))"
                                        onchange="setVoltageOffset(-parseFloat(this.value))">
                            </div>
                            <div class="d-flex flex-column align-items-center" style="width: 52px;">
                                <input type="range" class="form-range" id="current-offset-slider" 
                                        min="${-getCurrentScale() * 5}" max="${getCurrentScale() * 5}" value="${-getCurrentOffset()}" step="${getCurrentScale() * 0.1}"
                                        style="height: 230px; writing-mode: vertical-lr; direction: rtl;"
                                        oninput="setCurrentOffset(-parseFloat(this.value))"
                                        onchange="setCurrentOffset(-parseFloat(this.value))">
                            </div>
                        </div>
                        <div class="btn-group" role="group" aria-label="Horizontal Scale Controls" style="top:4px;">
                            <button type="button" class="btn btn-outline-light fs-4 d-flex align-items-center justify-content-center"
                                    id="horizontal-scale-down"
                                    style="width: 55px; height:50px;"
                                    onclick="stepTimebaseDown()">
                                <span style="white-space: nowrap; font-style:italic; font-family:Cambria;">H<i class="bi bi-dash"></i></span>
                            </button>
                            <button type="button" class="btn btn-outline-light fs-4 d-flex align-items-center justify-content-center"
                                    id="horizontal-scale-up"
                                    style="width: 55px; height:50px;"
                                    onclick="stepTimebaseUp()">
                                <span style="white-space: nowrap; font-style:italic; font-family:Cambria;">H<i class="bi bi-plus"></i></span>
                            </button>
                        </div>                        
                    </div>
                </div>
            </div>
        </div>
    </div>
    `;
}

// New Waveform Control Interface for main tab
export function WaveformControl(AppState) {
    const { synths } = AppState.synthState;
    if (!synths || synths.length === 0) {
        return '<div class="text-center text-muted">No synth data available</div>';
    }

    const phaseLabels = ['L1', 'L2', 'L3'];
    const phaseNames = phaseLabels.map(l => `Phase ${l}`);
    const phaseColors = phaseLabels.map(l => `${l}-dark`);

    // Helper function to determine if element should be selected during render
    function shouldBeSelected(idx, channel, type) {
        if (!window.selected) return false;
        return window.selected.idx === idx && 
               window.selected.channel === channel && 
               window.selected.type === type;
    }

    return `
    <div class="card border-0 rounded-0">
        <div class="card-body rounded bg-dark py-1 font-monospace">
            <div class="row">
                ${synths.map((synth, idx) => {
                    const VOLTAGE_MAX = getMaxVoltage();
                    const CURRENT_MAX = getMaxCurrent();
                    const scaledAmplitudeA = (synth.amplitude_a * VOLTAGE_MAX) / 100;
                    const scaledAmplitudeB = (synth.amplitude_b * CURRENT_MAX) / 100;
                    
                    return `
                    <!-- Phase ${idx + 1} Card -->
                    <div class="col px-1">
                        <div class="card bg-dark border-${phaseColors[idx]} h-100">
                            <div class="card-header bg-${phaseColors[idx]} py-1">
                                <h4 class="card-title mb-0 text-center">
                                    ${phaseNames[idx]}
                                </h4>
                            </div>
                            <div class="card-body px-1">
                                <div class="vstack gap-2">
                                    <!-- Power Enable Buttons -->
                                    <div class="hstack gap-1">
                                        <button type="button" class="btn btn-lg w-50 fs-2 p-2 ${synth.enabled.a ? 'btn-success' : 'btn-danger'}" 
                                                id="toggleChannelA_${idx}" 
                                                style="height:60px;font-style:italic; font-family:Cambria;"
                                                onclick="setSynthEnabled(${idx}, 'a', ${!synth.enabled.a})">
                                            <i class="bi bi-power me-1"></i>V
                                        </button>
                                        <button type="button" class="btn btn-lg w-50 fs-2 p-2 ${synth.enabled.b ? 'btn-success' : 'btn-danger'}" 
                                                id="toggleChannelB_${idx}" 
                                                style="height:60px;font-style:italic; font-family:Cambria;"
                                                onclick="setSynthEnabled(${idx}, 'b', ${!synth.enabled.b})">
                                            <i class="bi bi-power me-1"></i>I
                                        </button>
                                    </div>

                                    <!-- Voltage -->
                                    <div class="input-group selectable ${shouldBeSelected(idx, 'a', 'voltage') ? 'selected' : ''}" tabindex="0" 
                                        id="voltage_group_${idx}" onclick="setSelected(${idx}, 'a', 'voltage')">
                                        <div class="input-group-text fs-4 justify-content-center" style="width:50px; font-style:italic; font-family:Cambria;">V</div>
                                        <input type="text" class="form-control text-end fs-4" 
                                            id="voltage_input_${idx}" value="${scaledAmplitudeA.toFixed(1)}" 
                                            onblur="setVoltageDirect(${idx}, event.target.value)" 
                                            onkeydown="if(event.key==='Enter'){setVoltageDirect(${idx}, event.target.value)}">
                                        <div class="input-group-text text-muted" style="width:50px;">V<sub>rms</sub></div>
                                    </div>

                                    <!-- Current -->
                                    <div class="input-group selectable ${shouldBeSelected(idx, 'b', 'current') ? 'selected' : ''}" tabindex="0" 
                                        id="current_group_${idx}" onclick="setSelected(${idx}, 'b', 'current')">
                                        <div class="input-group-text fs-4 justify-content-center" style="width:50px; font-style:italic; font-family:Cambria;">I</div>
                                        <input type="text" class="form-control text-end fs-4" 
                                            id="current_input_${idx}" value="${scaledAmplitudeB.toFixed(2)}" 
                                            onblur="setCurrentDirect(${idx}, event.target.value)" 
                                            onkeydown="if(event.key==='Enter'){setCurrentDirect(${idx}, event.target.value)}">
                                        <div class="input-group-text text-muted" style="width:50px;">A<sub>rms</sub></div>
                                    </div>

                                    <!-- Voltage Phase -->
                                    <div class="input-group selectable ${shouldBeSelected(idx, 'a', 'phase') ? 'selected' : ''}" tabindex="0" 
                                        id="phase_a_group_${idx}" onclick="setSelected(${idx}, 'a', 'phase')">
                                        <div class="input-group-text fs-4 justify-content-center" style="width:50px; font-style:italic; font-family: Cambria;">&Phi;<sub>V</sub></div>
                                        <input type="text" class="form-control text-end fs-4" 
                                            id="phase_input_${idx}" value="${synth.phase_a.toFixed(1)}" 
                                            onblur="setPhaseDirect(${idx}, 'a', event.target.value)" 
                                            onkeydown="if(event.key==='Enter'){setPhaseDirect(${idx}, 'a', event.target.value)}">
                                        <div class="input-group-text text-muted" style="width:50px;">°</div>
                                    </div>

                                    <!-- Current Phase -->
                                    <div class="input-group selectable ${shouldBeSelected(idx, 'b', 'phase') ? 'selected' : ''}" tabindex="0" 
                                        id="phase_b_group_${idx}" onclick="setSelected(${idx}, 'b', 'phase')">
                                        <div class="input-group-text fs-4 justify-content-center" style="width:50px; font-style:italic; font-family: Cambria;">&Phi;<sub>I</sub></div>
                                        <input type="text" class="form-control text-end fs-4" 
                                            id="phase_input_${idx}" value="${synth.phase_b.toFixed(1)}" 
                                            onblur="setPhaseDirect(${idx}, 'b', event.target.value)" 
                                            onkeydown="if(event.key==='Enter'){setPhaseDirect(${idx}, 'b', event.target.value)}">
                                        <div class="input-group-text text-muted" style="width:50px;">°</div>
                                    </div>
                                    
                                    <!-- Frequency -->
                                    <div class="input-group selectable ${shouldBeSelected(idx, 'a', 'frequency') ? 'selected' : ''}" tabindex="0" 
                                        id="frequency_group_${idx}" onclick="setSelected(${idx}, 'a', 'frequency')">
                                        <div class="input-group-text fs-4 justify-content-center" style="width:50px; font-style:italic; font-family: Cambria;">f</div>
                                        <input type="text" class="form-control text-end fs-4" 
                                            id="frequency_input_${idx}" value="${synth.frequency_a.toFixed(1)}" 
                                            onblur="setFrequencyDirect(event.target.value)" 
                                            onkeydown="if(event.key==='Enter'){setFrequencyDirect(event.target.value)}">
                                        <div class="input-group-text text-muted" style="width:50px;">Hz</div>
                                        </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    `;
                }).join('')}
                <!-- Increment Control Buttons (shared for all phases) -->
                <div class="col px-1" style="max-width:100px" id="increment_buttons_waveform_control">
                    ${incrementButtons()}
                </div>
            </div>
        </div>
    </div>
    `;
}

export function HarmonicControl(AppState) {
    const { synths } = AppState.synthState
    if (!synths || synths.length === 0) {
        return `<div class="alert alert-info">No synths available for harmonic control.</div>`;
    }

    const phaseLabels = ['L1', 'L2', 'L3'];
    const phaseColors = phaseLabels.map(l => `${l}-dark`);

    function shouldBeSelected(idx, channel, type) {
        if (!window.selected) return false;
        return window.selected.idx === idx && 
               window.selected.channel === channel && 
               window.selected.type === type;
    }

    return `
    <div class="card border-0 rounded-0">
        <div class="card-body rounded bg-dark py-1 font-monospace">
            <div class="row">
                ${synths.map((synth, idx) => {
                    return `
                    <div class="col px-1">
                        <div class="card bg-dark border-${phaseColors[idx]} h-100">
                        <div class="card-header bg-${phaseColors[idx]} py-1">
                            <h4 class="card-title mb-0 text-center">
                                ${phaseLabels[idx]} Harmonics
                            </h4>
                        </div>
                        <div class="card-body px-1 w-100">
                            ${harmonicOffCanvas(synth, idx, 'a')}
                            ${harmonicOffCanvas(synth, idx, 'b')}
                        </div>
                    </div>
                </div>
                `;
                }).join('')}
                <!-- Increment Control Buttons (shared for all phases) -->
                <div class="col px-1" style="max-width:100px" id="increment_buttons_waveform_control">
                    ${incrementButtons()}
                </div>
            </div>
        </div>
    </div>
    `;

    function harmonicOffCanvas(synth, idx, channel) {

    const phase = `L${synth['id'] + 1}`;
    const waveSub = channel === 'a' ? 'v' : 'i';
    const waveType = channel === 'a' ? 'voltage' : 'current';
    return `
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
        `;
    }

}
