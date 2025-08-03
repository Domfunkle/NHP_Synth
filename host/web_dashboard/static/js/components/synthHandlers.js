// synthHandlers.js
// All event handler functions for synth controls

export async function incrementVoltage(idx, delta) {
    try {
        const synthState = getSynthState();
        const synth = synthState.synths[idx];
        let value = (synth.amplitude_a / 100) * VOLTAGE_RMS_MAX + delta;
        value = Math.max(0, Math.min(VOLTAGE_RMS_MAX, value));
        const percent = roundToPrecision(value / VOLTAGE_RMS_MAX * 100, 2);
        await setSynthAmplitude(synth.id, 'a', percent);
    } catch (error) {
        console.error('incrementVoltage: error incrementing voltage', error);
    }
}

export async function setVoltageDirect(idx, value) {
    try {
        const synthState = getSynthState();
        const synth = synthState.synths[idx];
        let v = parseFloat(value);
        if (isNaN(v)) return;
        v = Math.max(0, Math.min(VOLTAGE_RMS_MAX, v));
        const percent = roundToPrecision(v / VOLTAGE_RMS_MAX * 100, 2);
        await setSynthAmplitude(synth.id, 'a', percent);
    } catch (error) {
        console.error('setVoltageDirect: error setting voltage', error);
    }
}

export async function resetVoltage(idx) {
    try {
        const { defaults } = await getDefaults();
        const value = defaults[idx].amplitude_a;
        await setSynthAmplitude(idx, 'a', value);
    } catch (error) {
        console.error('resetVoltage: error resetting voltage', error);
    }
}

export async function incrementCurrent(idx, delta) {
    try {
        const synthState = getSynthState();
        const synth = synthState.synths[idx];
        let value = (synth.amplitude_b / 100) * CURRENT_RMS_MAX + delta;
        value = Math.max(0, Math.min(CURRENT_RMS_MAX, value));
        const percent = +(value / CURRENT_RMS_MAX * 100).toFixed(2);
        await setSynthAmplitude(synth.id, 'b', percent);
    } catch (error) {
        console.error('incrementCurrent: error incrementing current', error);
    }
}

export async function setCurrentDirect(idx, value) {
    try {
        const synthState = getSynthState();
        const synth = synthState.synths[idx];
        let v = parseFloat(value);
        if (isNaN(v)) return;
        v = Math.max(0, Math.min(CURRENT_RMS_MAX, v));
        const percent = +(v / CURRENT_RMS_MAX * 100).toFixed(2);
        await setSynthAmplitude(synth.id, 'b', percent);
    } catch (error) {
        console.error('setCurrentDirect: error setting current', error);
    }
}

export async function resetCurrent(idx) {
    try {
        const { defaults } = await getDefaults();
        const value = defaults[idx].amplitude_b;
        await setSynthAmplitude(idx, 'b', value);
    } catch (error) {
        console.error('resetCurrent: error resetting current', error);
    }
}

function wrapClamp(high, low, value) {
    let v = value;
    if (value > high) {
        v = low + (value - high);
    } else if (value < low) {
        v = high - (low - value);
    }
    if (v > high) v = high;
    if (v < low) v = low;
    return v;
}

export async function incrementPhase(idx, channel, delta) {
    try {
        const synthState = getSynthState();
        const synth = synthState.synths[idx];
        let value = synth[`phase_${channel}`] + delta;
        value = wrapClamp(180, -180, value);
        value = +value.toFixed(2);
        await setSynthPhase(synth.id, channel, value);
    } catch (error) {
        console.error('incrementPhase: error incrementing phase', error);
    }
}

export async function setPhaseDirect(idx, channel, value) {
    try {
        const synthState = getSynthState();
        const synth = synthState.synths[idx];
        let v = parseFloat(value);
        if (isNaN(v)) return;
        v = wrapClamp(180, -180, v);
        v = +v.toFixed(2);
        await setSynthPhase(synth.id, channel, v);
    } catch (error) {
        console.error('setPhaseDirect: error setting phase', error);
    }
}

export async function resetPhase(idx, channel) {
    try {
        const { defaults } = await getDefaults();
        const value = defaults[idx][`phase_${channel}`];
        await setSynthPhase(idx, channel, value);
    } catch (error) {
        console.error('resetPhase: error resetting phase', error);
    }
}

export async function incrementFrequency(delta) {
    try {
        const synthState = getSynthState();
        const FREQ_MIN = 20;
        const FREQ_MAX = 70;
        for (const synth of synthState.synths) {
            if (!synth || typeof synth.id === 'undefined') continue;
            for (const channel of ['a', 'b']) {
                let value = synth[`frequency_${channel}`] + delta;
                value = Math.max(FREQ_MIN, Math.min(FREQ_MAX, value));
                value = +value.toFixed(2);
                await setSynthFrequency(synth.id, channel, value);
            }
        }
    } catch (error) {
        console.error('incrementFrequency: error incrementing frequency', error);
    }
}

export async function setFrequencyDirect(value) {
    try {
        const synthState = getSynthState();
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
    } catch (error) {
        console.error('setFrequencyDirect: error setting frequency', error);
    }
}

export async function resetFrequency() {
    try {
        const { defaults } = await getDefaults();
        for (let idx = 0; idx < defaults.length; idx++) {
            const synth = defaults[idx];
            if (!synth) continue;
            for (const channel of ['a', 'b']) {
                const value = synth[`frequency_${channel}`];
                await setSynthFrequency(idx, channel, value);
            }
        }
    } catch (error) {
        console.error('resetFrequency: error resetting frequency', error);
    }
}


/**
 * Increment a harmonic property (order, amplitude, or phase) for a given synth.
 * @param {number} idx - Synth index
 * @param {string} channel - 'a' or 'b'
 * @param {string|number} id - Harmonic id
 * @param {number} delta - Amount to increment
 * @param {'order'|'amplitude'|'phase'} property - Which property to increment
 */
export async function incrementHarmonic(idx, channel, id, delta, property) {
    try {
        const synthState = getSynthState();
        const synth = synthState.synths[idx];
        const harmonic = synth[`harmonics_${channel}`]?.find(h => h.id == id);
        
        const value = {
            id,
            order: property === 'order' ? (harmonic?.order ?? 1) : (harmonic?.order ?? 3),
            amplitude: harmonic?.amplitude ?? 0,
            phase: harmonic?.phase ?? 0
        };

        if (property === 'order') {
            const maxOrder = 127;
            value.order += delta;
            value.order = Math.max(1, Math.min(maxOrder, value.order));
            value.order = +value.order.toFixed(0);
        } else if (property === 'amp') {
            value.amplitude += delta;
            value.amplitude = Math.max(0, Math.min(100, value.amplitude));
            value.amplitude = +value.amplitude.toFixed(2);
        } else if (property === 'phase') {
            value.phase += delta;
            value.phase = ((value.phase % 360) + 360) % 360;
            value.phase = +value.phase.toFixed(2);
        } else {
            throw new Error(`Invalid property: ${property}`);
        }
        await setSynthHarmonics(synth.id, channel, value);
    } catch (error) {
        console.error('incrementHarmonic: error incrementing harmonic', error);
        return;
    }
}

export async function resetHarmonic(idx, channel, id, property) {
    try {
        const synthState = getSynthState();
        const synth = synthState?.synths?.[idx];
        const harmonic = synth[`harmonics_${channel}`]?.find(h => h.id == id);

        const { defaults } = await getDefaults();
        const synthDefaults = defaults?.[idx];
        let defaultHarmonic = synthDefaults?.[`harmonics_${channel}`]?.find(h => h.id === id);
        if (!defaultHarmonic) {
            defaultHarmonic = {
                id,
                order: 0,
                amplitude: 0,
                phase: 0
            };
        }
        const value = {
            id,
            order: property === 'order' ? defaultHarmonic.order : harmonic.order,
            amplitude: property === 'amp' ? defaultHarmonic.amplitude : harmonic.amplitude,
            phase: property === 'phase' ? defaultHarmonic.phase : harmonic.phase
        };
        await setSynthHarmonics(synth.id, channel, value);

    } catch (error) {
        console.error('resetHarmonic: error resetting harmonic', error);
        return;
    }
}

