// synthHandlers.js
// All event handler functions for synth controls
import { setSynthAmplitude, setSynthFrequency, setSynthPhase, getDefaults, setSynthHarmonics } from './api.js';
import { getSynthState } from './state.js';

export async function incrementVoltage(idx, delta) {
    const synthState = getSynthState();
    if (!synthState || !synthState.synths || !synthState.synths[idx]) {
        console.error('incrementVoltage: synth is undefined for idx', idx);
        return;
    }
    const synth = synthState.synths[idx];
    if (typeof synth.id === 'undefined') {
        console.error('incrementVoltage: synth.id is undefined for idx', idx, synth);
        return;
    }
    const VOLTAGE_RMS_MAX = 240;
    let value = (synth.amplitude_a / 100) * VOLTAGE_RMS_MAX + delta;
    value = Math.max(0, Math.min(VOLTAGE_RMS_MAX, value));
    const percent = +(value / VOLTAGE_RMS_MAX * 100).toFixed(2);
    await setSynthAmplitude(synth.id, 'a', percent);
}

export async function setVoltageDirect(idx, value) {
    const synthState = getSynthState();
    if (!synthState || !synthState.synths || !synthState.synths[idx]) {
        console.error('setVoltageDirect: synth is undefined for idx', idx);
        return;
    }
    const synth = synthState.synths[idx];
    if (typeof synth.id === 'undefined') {
        console.error('setVoltageDirect: synth.id is undefined for idx', idx, synth);
        return;
    }
    const VOLTAGE_RMS_MAX = 240;
    let v = parseFloat(value);
    if (isNaN(v)) return;
    v = Math.max(0, Math.min(VOLTAGE_RMS_MAX, v));
    const percent = +(v / VOLTAGE_RMS_MAX * 100).toFixed(2);
    await setSynthAmplitude(synth.id, 'a', percent);
}

export async function resetVoltage(idx) {
    const { defaults } = await getDefaults();
    const value = defaults[idx].amplitude_a;
    await setSynthAmplitude(idx, 'a', value);
}

export async function incrementCurrent(idx, delta) {
    const synthState = getSynthState();
    if (!synthState || !synthState.synths || !synthState.synths[idx]) {
        console.error('incrementCurrent: synth is undefined for idx', idx);
        return;
    }
    const synth = synthState.synths[idx];
    if (typeof synth.id === 'undefined') {
        console.error('incrementCurrent: synth.id is undefined for idx', idx, synth);
        return;
    }
    const CURRENT_RMS_MAX = 10;
    let value = (synth.amplitude_b / 100) * CURRENT_RMS_MAX + delta;
    value = Math.max(0, Math.min(CURRENT_RMS_MAX, value));
    const percent = +(value / CURRENT_RMS_MAX * 100).toFixed(2);
    await setSynthAmplitude(synth.id, 'b', percent);
}

export async function setCurrentDirect(idx, value) {
    const synthState = getSynthState();
    if (!synthState || !synthState.synths || !synthState.synths[idx]) {
        console.error('setCurrentDirect: synth is undefined for idx', idx);
        return;
    }
    const synth = synthState.synths[idx];
    if (typeof synth.id === 'undefined') {
        console.error('setCurrentDirect: synth.id is undefined for idx', idx, synth);
        return;
    }
    const CURRENT_RMS_MAX = 10;
    let v = parseFloat(value);
    if (isNaN(v)) return;
    v = Math.max(0, Math.min(CURRENT_RMS_MAX, v));
    const percent = +(v / CURRENT_RMS_MAX * 100).toFixed(2);
    await setSynthAmplitude(synth.id, 'b', percent);
}

export async function resetCurrent(idx) {
    const { defaults } = await getDefaults();
    const value = defaults[idx].amplitude_b;
    await setSynthAmplitude(idx, 'b', value);
}

export async function incrementPhase(idx, channel, delta) {
    const synthState = getSynthState();
    if (!synthState || !synthState.synths || !synthState.synths[idx]) {
        console.error('incrementPhase: synth is undefined for idx', idx);
        return;
    }
    const synth = synthState.synths[idx];
    if (typeof synth.id === 'undefined') {
        console.error('incrementPhase: synth.id is undefined for idx', idx, synth);
        return;
    }
    if (typeof channel !== 'string' || !['a', 'b'].includes(channel)) {
        console.error('incrementPhase: invalid channel', channel);
        return;
    }
    let value = synth[`phase_${channel}`] + delta;
    value = ((value % 360) + 360) % 360;
    value = +value.toFixed(2);
    await setSynthPhase(synth.id, channel, value);
}

export async function setPhaseDirect(idx, channel, value) {
    const synthState = getSynthState();
    if (!synthState || !synthState.synths || !synthState.synths[idx]) {
        console.error('setPhaseDirect: synth is undefined for idx', idx);
        return;
    }
    const synth = synthState.synths[idx];
    if (typeof synth.id === 'undefined') {
        console.error('setPhaseDirect: synth.id is undefined for idx', idx, synth);
        return;
    }
    if (typeof channel !== 'string' || !['a', 'b'].includes(channel)) {
        console.error('setPhaseDirect: invalid channel', channel);
        return;
    }
    let v = parseFloat(value);
    if (isNaN(v)) return;
    v = ((v % 360) + 360) % 360;
    v = +v.toFixed(2);
    await setSynthPhase(synth.id, channel, v);
}

export async function resetPhase(idx, channel) {
    const { defaults } = await getDefaults();
    const value = defaults[idx][`phase_${channel}`];
    await setSynthPhase(idx, channel, value);
}

export async function incrementFrequency(delta) {
    const synthState = getSynthState();
    if (!synthState || !synthState.synths) {
        console.error('incrementFrequency: synths are undefined');
        return;
    }
    const FREQ_MIN = 20;
    const FREQ_MAX = 70;
    for (const synth of synthState.synths) {
        if (!synth || typeof synth.id === 'undefined') continue;
        for (const channel of ['a', 'b']) {
            let value = synth[`frequency_${channel}`] + delta * 1;
            value = Math.max(FREQ_MIN, Math.min(FREQ_MAX, value));
            value = +value.toFixed(2);
            await setSynthFrequency(synth.id, channel, value);
        }
    }
}

export async function setFrequencyDirect(value) {
    const synthState = getSynthState();
    if (!synthState || !synthState.synths) {
        console.error('setFrequencyDirect: synths are undefined');
        return;
    }
    const FREQ_MIN = 20;
    const FREQ_MAX = 70;
    let v = parseFloat(value);
    if (isNaN(v)) return;
    v = Math.max(FREQ_MIN, Math.min(FREQ_MAX, v));
    v = +v.toFixed(2);
    for (const synth of synthState.synths) {
        if (!synth || typeof synth.id === 'undefined') continue;
        for (const channel of ['a', 'b']) {
            await setSynthFrequency(synth.id, channel, v);
        }
    }
}

export async function resetFrequency() {
    const { defaults } = await getDefaults();
    for (let idx = 0; idx < defaults.length; idx++) {
        const synth = defaults[idx];
        if (!synth) continue;
        for (const channel of ['a', 'b']) {
            const value = synth[`frequency_${channel}`];
            await setSynthFrequency(idx, channel, value);
        }
    }
}

export async function incrementHarmonicOrder(idx, channel, id, delta) {
    const synthState = getSynthState();
    if (!synthState || !synthState.synths || !synthState.synths[idx]) {
        console.error('incrementHarmonicOrder: synth is undefined for idx', idx);
        return;
    }
    const synth = synthState.synths[idx];
    if (typeof synth.id === 'undefined') {
        console.error('incrementHarmonicOrder: synth.id is undefined for idx', idx, synth);
        return;
    }
    if (typeof channel !== 'string' || !['a', 'b'].includes(channel)) {
        console.error('incrementHarmonicOrder: invalid channel', channel);
        return;
    }
    const maxOrder = 127; // Assuming max order is 127
    // find the index of the harmonic by id
    const index = synth[`harmonics_${channel}`]?.findIndex(h => h.id === id);

    let order = synth[`harmonics_${channel}`]?.[index]?.order ?? 1;
    let amplitude = synth[`harmonics_${channel}`]?.[index]?.amplitude ?? 0;
    let phase = synth[`harmonics_${channel}`]?.[index]?.phase ?? 0;

    order += delta;
    order = Math.max(1, Math.min(maxOrder, order));
    const value = { id, order, amplitude, phase };
    await setSynthHarmonics(synth.id, channel, value);
}