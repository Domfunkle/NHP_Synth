// api.js - API and utility functions for NHP Synth Dashboard

let socketInstance = null;
export function setSocket(s) { socketInstance = s; }

/**
 * GET from API endpoint
 * @param {string} endpoint
 * @returns {Promise<object>}
 */
async function apiGet(endpoint) {
    const response = await fetch(endpoint);
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`GET ${endpoint} failed: ${response.status} ${errorText}`);
    }
    return await response.json();
}

/**
 * POST to API endpoint with JSON body
 * @param {string} endpoint
 * @param {object} data
 * @returns {Promise<object>}
 */
async function apiPost(endpoint, data) {
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
 * Send a WebSocket command to a synth
 * @param {WebSocket} socket - The WebSocket connection
 * @param {number} synthId - The ID of the synth
 * @param {string} command - The command to send (e.g. 'set_amplitude', 'set_frequency')
 * @param {string} channel - The channel to target ('a' or 'b')
 * @param {number|Array|String} value - The value to set (can be a number, array of floats, or comma-separated string)
 * @param {function} [callback] - Optional callback function to handle the response
 * @returns {void}
 */
function sendSynthCommandWS(socket, synthId, command, channel, value, callback) {
    const payload = {
        synth_id: synthId,
        command: command,
        channel: channel,
        value: value
    };
    socket.emit('command', payload, (response) => {
        if (callback) callback(response);
    });
}

/**
 * Set amplitude for a synth channel
 * @param {number} synthId
 * @param {string} channel - 'a' or 'b'
 * @param {number} value
 */
export async function setSynthAmplitude(synthId, channel, value) {
    return sendSynthCommandWS(socketInstance, synthId, 'set_amplitude', channel, value);
    // return apiPost(`/api/synths/${synthId}/amplitude`, { channel, value });
}

/**
 * Set frequency for a synth channel
 * @param {number} synthId
 * @param {string} channel - 'a' or 'b'
 * @param {number} value
 */
export async function setSynthFrequency(synthId, channel, value) {
    return sendSynthCommandWS(socketInstance, synthId, 'set_frequency', channel, value);
    // return apiPost(`/api/synths/${synthId}/frequency`, { channel, value });
}

/**
 * Set phase for a synth channel
 * @param {number} synthId
 * @param {string} channel - 'a' or 'b'
 * @param {number} value
 */
export async function setSynthPhase(synthId, channel, value) {
    return sendSynthCommandWS(socketInstance, synthId, 'set_phase', channel, value);
    // return apiPost(`/api/synths/${synthId}/phase`, { channel, value });
}

/**
 * Set harmonics for a synth channel
 * @param {number} synthId
 * @param {string} channel - 'a' or 'b'
 * @param {number[]|string} value - array of floats or comma-separated string
 */
export async function setSynthHarmonics(synthId, channel, value) {
    return sendSynthCommandWS(socketInstance, synthId, 'set_harmonics', channel, value);
    // return apiPost(`/api/synths/${synthId}/harmonics`, { channel, value });
}

/**
 * Send a generic command to a synth (advanced)
 * @param {number} synthId
 * @param {string} command - e.g. 'set_phase', 'set_amplitude', etc.
 * @param {string} channel
 * @param {number|Array|String} value
 */
async function sendSynthCommand(synthId, command, channel, value) {
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

/**
 * Get the defaults for the synth state
 * @returns {object}
 */
export async function getDefaults() {
    return apiGet('/api/defaults');
}