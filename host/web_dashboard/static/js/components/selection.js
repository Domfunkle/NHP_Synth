// Selection logic for NHP Synth Dashboard
// Exported as ES module

export const selected = { idx: null, channel: null, type: null };

export function setSelected(idx, channel, type) {
    window.selected = { idx, channel, type };
    document.querySelectorAll('.selectable').forEach(e => {
        e.classList.remove('selected');
    });

    const selId = type === 'voltage' ? `voltage_input_${idx}` :
                  type === 'current' ? `current_input_${idx}` :
                  type === 'phase' ? `phase_input_${idx}_${channel}` :
                  type === 'frequency' ? `frequency_input_${idx}` :
                  (type.startsWith('harmonic_order_')) ? `harmonic_${channel}_order_${type.split('_')[2]}_${idx}` :
                  (type.startsWith('harmonic_amp_')) ? `harmonic_${channel}_amp_${type.split('_')[2]}_${idx}` :
                  (type.startsWith('harmonic_phase_')) ? `harmonic_${channel}_phase_${type.split('_')[2]}_${idx}` : null;

    if (!selId) return;

    const group = document.getElementById(selId)?.closest('.selectable');
    if (group) {
        group.classList.add('selected');
    }

    // Re-render increment buttons in waveform offcanvas
    const waveformInc = document.getElementById(`increment_buttons_${idx}`);
    if (waveformInc) waveformInc.innerHTML = incrementButtons();

    // Re-render increment buttons in harmonic offcanvas (both channels)
    ['a', 'b'].forEach(ch => {
        const harmInc = document.getElementById(`increment_buttons_harmonics_${ch}_${idx}`);
        if (harmInc) harmInc.innerHTML = incrementButtons();
    });
}

export function clearSelected() {
    window.selected = { idx: null, channel: null, type: null };
    document.querySelectorAll('.selectable').forEach(e => {
        e.classList.remove('selected');
    });
}

export function incrementSelected(delta) {
    const { idx, channel, type } = window.selected;
    if (idx === null || !type) return;
    if (type === 'voltage') incrementVoltage(idx, delta);
    if (type === 'current') incrementCurrent(idx, delta);
    if (type === 'phase') incrementPhase(idx, channel, delta);
    if (type === 'frequency') incrementFrequency(delta);
    if (type.startsWith('harmonic')) {
        const harmonicId = type.split('_')[2];
        const property = type.split('_')[1];
        incrementHarmonic(idx, channel, harmonicId, delta, property);
    }
}

export function resetSelected() {
    const { idx, channel, type } = window.selected;
    if (idx === null || !type) return;
    if (type === 'voltage') resetVoltage(idx);
    if (type === 'current') resetCurrent(idx);
    if (type === 'phase') resetPhase(idx, channel);
    if (type === 'frequency') resetFrequency();
    if (type.startsWith('harmonic')) {
        const harmonicId = +type.split('_')[2];
        const property = type.split('_')[1];
        resetHarmonic(idx, channel, harmonicId, property);
    }
}
