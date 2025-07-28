// api.js - API and utility functions for NHP Synth Dashboard

/**
 * POST to API endpoint with JSON body
 * @param {string} endpoint
 * @param {object} data
 * @returns {Promise<object>}
 */
export async function apiPost(endpoint, data) {
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`POST ${endpoint} failed: ${response.status} ${errorText}`);
    }
    return await response.json();
}

/**
 * Set amplitude for a synth channel
 * @param {number} synthId
 * @param {string} channel - 'a' or 'b'
 * @param {number} value
 */
export async function setSynthAmplitude(synthId, channel, value) {
    return apiPost(`/api/synths/${synthId}/amplitude`, { channel, value });
}

/**
 * Set frequency for a synth channel
 * @param {number} synthId
 * @param {string} channel - 'a' or 'b'
 * @param {number} value
 */
export async function setSynthFrequency(synthId, channel, value) {
    return apiPost(`/api/synths/${synthId}/frequency`, { channel, value });
}

/**
 * Set phase for a synth channel
 * @param {number} synthId
 * @param {string} channel - 'a' or 'b'
 * @param {number} value
 */
export async function setSynthPhase(synthId, channel, value) {
    return apiPost(`/api/synths/${synthId}/phase`, { channel, value });
}

/**
 * Set harmonics for a synth channel
 * @param {number} synthId
 * @param {string} channel - 'a' or 'b'
 * @param {number[]|string} value - array of floats or comma-separated string
 */
export async function setSynthHarmonics(synthId, channel, value) {
    return apiPost(`/api/synths/${synthId}/harmonics`, { channel, value });
}

/**
 * Send a generic command to a synth (advanced)
 * @param {number} synthId
 * @param {string} command - e.g. 'set_phase', 'set_amplitude', etc.
 * @param {string} channel
 * @param {number|Array|String} value
 */
export async function sendSynthCommand(synthId, command, channel, value) {
    return apiPost(`/api/synths/${synthId}/command`, { command, channel, value });
}

/**
 * Deep compare utility for synth state
 * @param {object} a
 * @param {object} b
 * @returns {boolean}
 */
export function synthStateEquals(a, b) {
    if (!a || !b) return false;
    return JSON.stringify(a) === JSON.stringify(b);
}
