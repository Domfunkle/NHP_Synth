// synthHandlers.js
// All event handler functions for synth controls
import { setSynthAmplitude, setSynthFrequency, setSynthPhase, getDefaults } from './api.js';
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

export async function incrementFrequency(idx, delta) {
    const synthState = getSynthState();
    if (!synthState || !synthState.synths || !synthState.synths[idx]) {
        console.error('incrementFrequency: synth is undefined for idx', idx);
        return;
    }
    const synth = synthState.synths[idx];
    if (typeof synth.id === 'undefined') {
        console.error('incrementFrequency: synth.id is undefined for idx', idx, synth);
        return;
    }
    let value = synth.frequency_a + delta * 1;
    value = Math.max(0, value);
    value = +value.toFixed(2);
    await setSynthFrequency(synth.id, 'a', value);
}

export async function setFrequencyDirect(idx, value) {
    const synthState = getSynthState();
    if (!synthState || !synthState.synths || !synthState.synths[idx]) {
        console.error('setFrequencyDirect: synth is undefined for idx', idx);
        return;
    }
    const synth = synthState.synths[idx];
    if (typeof synth.id === 'undefined') {
        console.error('setFrequencyDirect: synth.id is undefined for idx', idx, synth);
        return;
    }
    let v = parseFloat(value);
    if (isNaN(v)) return;
    v = Math.max(0, v);
    v = +v.toFixed(2);
    await setSynthFrequency(synth.id, 'a', v);
}

export async function resetFrequency(idx) {
    const { defaults } = await getDefaults();
    const value = defaults[idx].frequency_a;
    await setSynthFrequency(idx, 'a', value);
}
