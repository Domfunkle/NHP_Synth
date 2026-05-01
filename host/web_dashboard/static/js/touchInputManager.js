let targetInput = null;
let numericModal = null;
let keyboardModal = null;
let numericDisplay = null;
let keyboardDisplay = null;
let bsNumericModal = null;
let bsKeyboardModal = null;
let keyboardUpper = false;
let numericRules = null;
let numericReplaceOnNextDigit = false;

function isEditableInput(el) {
    if (!el) return false;
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return false;
    if (el.disabled || el.readOnly) return false;
    if (el.type === 'checkbox' || el.type === 'range') return false;
    return true;
}

function getTouchMode(el) {
    if (!el.classList.contains('touch-entry')) return null;
    if (el.classList.contains('touch-entry-numeric')) return 'numeric';
    if (el.classList.contains('touch-entry-text')) return 'text';

    // Fallback for convenience if base class exists but subtype omitted.
    if (el instanceof HTMLInputElement && el.type === 'number') return 'numeric';
    return 'text';
}

function clampToInputBounds(value, input) {
    let v = value;
    if (input instanceof HTMLInputElement) {
        if (input.min !== '') {
            const min = parseFloat(input.min);
            if (!Number.isNaN(min)) v = Math.max(v, min);
        }
        if (input.max !== '') {
            const max = parseFloat(input.max);
            if (!Number.isNaN(max)) v = Math.min(v, max);
        }
    }
    return v;
}

function decimalsFromStep(stepText) {
    if (!stepText || stepText === 'any') return null;
    const s = String(stepText);
    const dot = s.indexOf('.');
    if (dot < 0) return 0;
    return s.length - dot - 1;
}

function roundTo(value, decimals) {
    const d = Math.max(0, decimals | 0);
    const p = 10 ** d;
    return Math.round((value + Number.EPSILON) * p) / p;
}

function normalizeOddOrder(value, min, max, direction = 0) {
    let v = Math.round(value);
    if (v % 2 === 0) {
        const up = v < max ? v + 1 : v - 1;
        const down = v > min ? v - 1 : v + 1;
        if (direction < 0) {
            v = down;
        } else if (direction > 0) {
            v = up;
        } else {
            v = Math.abs(up - value) <= Math.abs(down - value) ? up : down;
        }
    }
    return Math.max(min, Math.min(max, v));
}

function getNumericRules(input) {
    const precisionAttr = input.getAttribute('data-touch-precision');
    const precision = precisionAttr !== null ? parseInt(precisionAttr, 10) : null;
    const stepDecimals = decimalsFromStep(input.step);

    const stepListAttr = input.getAttribute('data-touch-steps');
    const allowedSteps = stepListAttr
        ? stepListAttr
            .split(',')
            .map((v) => parseFloat(v.trim()))
            .filter((v) => Number.isFinite(v) && v > 0)
        : null;

    const rules = {
        integerOnly:
            input.classList.contains('touch-entry-integer') ||
            input.getAttribute('data-touch-integer') === 'true',
        oddOnly:
            input.classList.contains('touch-entry-odd') ||
            input.getAttribute('data-touch-odd') === 'true',
        precision: Number.isInteger(precision) ? Math.max(0, precision) : stepDecimals,
        allowedSteps,
    };

    if (rules.integerOnly) {
        rules.precision = 0;
    }
    return rules;
}

function normalizeNumericValue(raw, input, rules, direction = 0) {
    let v = raw;

    if (rules.integerOnly) {
        v = Math.round(v);
    } else {
        // Keep float math stable for repetitive +/- steps.
        v = roundTo(v, 6);
        if (Number.isInteger(rules.precision)) {
            v = roundTo(v, rules.precision);
        }
    }

    v = clampToInputBounds(v, input);

    if (rules.oddOnly) {
        const min = input.min !== '' && !Number.isNaN(parseFloat(input.min)) ? parseFloat(input.min) : 3;
        const max = input.max !== '' && !Number.isNaN(parseFloat(input.max)) ? parseFloat(input.max) : 127;
        v = normalizeOddOrder(v, min, max, direction);
    }

    if (!rules.integerOnly && Number.isInteger(rules.precision)) {
        v = roundTo(v, rules.precision);
    }

    return v;
}

function configureNumericControls(rules) {
    if (!numericModal) return;

    const stepButtons = numericModal.querySelectorAll('[data-numpad-step]');
    stepButtons.forEach((btn) => {
        const stepAttr = btn.getAttribute('data-numpad-step');
        const step = parseFloat(stepAttr || '');
        if (Number.isNaN(step)) {
            btn.classList.remove('d-none');
            return;
        }

        if (Array.isArray(rules.allowedSteps) && rules.allowedSteps.length > 0) {
            const absStep = Math.abs(step);
            const allowed = rules.allowedSteps.some((s) => Math.abs(s - absStep) < 1e-9);
            if (!allowed) {
                btn.classList.add('d-none');
                return;
            }
        }

        // Integer-only fields (for example harmonic order) should not show fractional step buttons.
        if (rules.integerOnly && !Number.isInteger(step)) {
            btn.classList.add('d-none');
        } else {
            btn.classList.remove('d-none');
        }
    });

    const decimalBtn = numericModal.querySelector('[data-numpad-digit="."]');
    if (decimalBtn) {
        if (rules.integerOnly) decimalBtn.classList.add('d-none');
        else decimalBtn.classList.remove('d-none');
    }

    const resetBtn = numericModal.querySelector('#touch-numpad-reset');
    if (resetBtn) {
        const resetType = targetInput?.getAttribute('data-reset-type');
        if (resetType) resetBtn.classList.remove('d-none');
        else resetBtn.classList.add('d-none');
    }
}

async function resetNumericToDefault() {
    if (!targetInput) return;

    const resetType = targetInput.getAttribute('data-reset-type');
    if (!resetType) return;

    try {
        if (resetType === 'voltage') {
            const idx = parseInt(targetInput.getAttribute('data-reset-idx') || '', 10);
            if (!Number.isNaN(idx) && typeof window.resetVoltage === 'function') {
                await window.resetVoltage(idx);
            }
        } else if (resetType === 'current') {
            const idx = parseInt(targetInput.getAttribute('data-reset-idx') || '', 10);
            if (!Number.isNaN(idx) && typeof window.resetCurrent === 'function') {
                await window.resetCurrent(idx);
            }
        } else if (resetType === 'phase') {
            const idx = parseInt(targetInput.getAttribute('data-reset-idx') || '', 10);
            const channel = targetInput.getAttribute('data-reset-channel');
            if (!Number.isNaN(idx) && channel && typeof window.resetPhase === 'function') {
                await window.resetPhase(idx, channel);
            }
        } else if (resetType === 'frequency') {
            if (typeof window.resetFrequency === 'function') {
                await window.resetFrequency();
            }
        } else if (resetType === 'harmonic') {
            const idx = parseInt(targetInput.getAttribute('data-reset-idx') || '', 10);
            const channel = targetInput.getAttribute('data-reset-channel');
            const harmonicId = parseInt(targetInput.getAttribute('data-reset-id') || '', 10);
            const property = targetInput.getAttribute('data-reset-property');
            if (
                !Number.isNaN(idx) &&
                !Number.isNaN(harmonicId) &&
                channel &&
                property &&
                typeof window.resetHarmonic === 'function'
            ) {
                await window.resetHarmonic(idx, channel, harmonicId, property);
            }
        }
    } catch (error) {
        console.error('resetNumericToDefault: failed to reset value', error);
    } finally {
        if (bsNumericModal) bsNumericModal.hide();
    }
}

function commitValue(value) {
    if (!targetInput) return;
    targetInput.value = value;
    targetInput.dispatchEvent(new Event('input', { bubbles: true }));
    targetInput.dispatchEvent(new Event('change', { bubbles: true }));
    targetInput.dispatchEvent(new Event('blur', { bubbles: true }));
}

function setNumericDisplay(next) {
    if (!numericDisplay) return;
    numericDisplay.value = String(next);
}

function getNumericValue() {
    if (!numericDisplay || numericDisplay.value.trim() === '' || numericDisplay.value === '-') return 0;
    const parsed = parseFloat(numericDisplay.value);
    return Number.isNaN(parsed) ? 0 : parsed;
}

function openNumeric(input) {
    if (!bsNumericModal) return;
    targetInput = input;
    numericRules = getNumericRules(input);
    numericReplaceOnNextDigit = true;
    configureNumericControls(numericRules);
    setNumericDisplay(input.value === '' ? '0' : input.value);
    bsNumericModal.show();
}

function applyNumericStep(step) {
    const next = getNumericValue() + step;
    numericReplaceOnNextDigit = false;
    let valueToCommit = next;

    if (!targetInput || !numericRules) {
        setNumericDisplay(next);
        commitValue(String(next));
        return;
    }
    const normalized = normalizeNumericValue(next, targetInput, numericRules, Math.sign(step));
    setNumericDisplay(normalized);
    valueToCommit = normalized;

    // Step buttons are direct adjustments: apply immediately.
    commitValue(String(valueToCommit));
}

function appendNumericDigit(digit) {
    if (!numericDisplay) return;

    if (numericReplaceOnNextDigit) {
        numericReplaceOnNextDigit = false;
        if (digit === '.') {
            if (numericRules?.integerOnly) return;
            setNumericDisplay('0.');
            return;
        }
        setNumericDisplay(digit);
        return;
    }

    const current = numericDisplay.value || '';
    if (digit === '.' && numericRules?.integerOnly) return;
    if (digit === '.' && current.includes('.')) return;
    if (current === '0' && digit !== '.') {
        setNumericDisplay(digit);
        return;
    }
    if (current === '-0' && digit !== '.') {
        setNumericDisplay('-' + digit);
        return;
    }
    setNumericDisplay(current + digit);
}

function toggleNumericSign() {
    if (!numericDisplay) return;
    numericReplaceOnNextDigit = false;
    const v = numericDisplay.value || '';
    if (v.startsWith('-')) setNumericDisplay(v.slice(1));
    else setNumericDisplay('-' + v);
}

function backspaceNumeric() {
    if (!numericDisplay) return;
    numericReplaceOnNextDigit = false;
    const v = numericDisplay.value || '';
    setNumericDisplay(v.slice(0, -1));
}

function clearNumeric() {
    numericReplaceOnNextDigit = false;
    setNumericDisplay('');
}

function applyNumeric() {
    if (!targetInput || !numericDisplay || !numericRules) return;
    const raw = numericDisplay.value.trim();
    if (raw === '' || raw === '-') return;
    const parsed = parseFloat(raw);
    if (Number.isNaN(parsed)) return;
    const normalized = normalizeNumericValue(parsed, targetInput, numericRules);
    commitValue(String(normalized));
    bsNumericModal.hide();
}

function setKeyboardDisplay(next) {
    if (!keyboardDisplay) return;
    keyboardDisplay.value = next;
}

function appendKeyboardChar(ch) {
    if (!keyboardDisplay) return;
    const out = keyboardUpper ? ch.toUpperCase() : ch;
    setKeyboardDisplay((keyboardDisplay.value || '') + out);
}

function backspaceKeyboard() {
    if (!keyboardDisplay) return;
    setKeyboardDisplay((keyboardDisplay.value || '').slice(0, -1));
}

function clearKeyboard() {
    setKeyboardDisplay('');
}

function toggleKeyboardCase() {
    keyboardUpper = !keyboardUpper;
}

function openKeyboard(input) {
    if (!bsKeyboardModal) return;
    targetInput = input;
    keyboardUpper = false;
    setKeyboardDisplay(input.value || '');
    bsKeyboardModal.show();
}

function applyKeyboard() {
    if (!keyboardDisplay) return;
    commitValue(keyboardDisplay.value || '');
    bsKeyboardModal.hide();
}

export function initTouchInputManager() {
    numericModal = document.getElementById('touch-numpad-modal');
    keyboardModal = document.getElementById('touch-keyboard-modal');
    numericDisplay = document.getElementById('touch-numpad-display');
    keyboardDisplay = document.getElementById('touch-keyboard-display');
    if (!numericModal || !keyboardModal || typeof bootstrap === 'undefined') return;

    bsNumericModal = bootstrap.Modal.getOrCreateInstance(numericModal, { backdrop: true, keyboard: true });
    bsKeyboardModal = bootstrap.Modal.getOrCreateInstance(keyboardModal, { backdrop: true, keyboard: true });

    document.addEventListener('click', (event) => {
        const input = event.target.closest('input, textarea');
        if (!isEditableInput(input)) return;
        const mode = getTouchMode(input);
        if (!mode) return;

        event.preventDefault();
        if (mode === 'numeric') openNumeric(input);
        else openKeyboard(input);
    });

    numericModal.addEventListener('click', (event) => {
        const digit = event.target.getAttribute('data-numpad-digit');
        if (digit !== null) {
            appendNumericDigit(digit);
            return;
        }

        const stepAttr = event.target.getAttribute('data-numpad-step');
        if (stepAttr !== null) {
            const step = parseFloat(stepAttr);
            if (!Number.isNaN(step)) applyNumericStep(step);
            return;
        }

        const action = event.target.getAttribute('data-numpad-action');
        if (!action) return;
        if (action === 'reset-default') {
            resetNumericToDefault();
            return;
        }
        if (action === 'toggle-sign') toggleNumericSign();
        if (action === 'backspace') backspaceNumeric();
        if (action === 'clear') clearNumeric();
    });

    keyboardModal.addEventListener('click', (event) => {
        const ch = event.target.getAttribute('data-keyboard-char');
        if (ch !== null) {
            appendKeyboardChar(ch);
            return;
        }

        const action = event.target.getAttribute('data-keyboard-action');
        if (!action) return;
        if (action === 'space') appendKeyboardChar(' ');
        if (action === 'toggle-case') toggleKeyboardCase();
        if (action === 'backspace') backspaceKeyboard();
        if (action === 'clear') clearKeyboard();
    });

    const applyNumericBtn = document.getElementById('touch-numpad-apply');
    if (applyNumericBtn) {
        applyNumericBtn.addEventListener('click', applyNumeric);
    }

    const applyKeyboardBtn = document.getElementById('touch-keyboard-apply');
    if (applyKeyboardBtn) {
        applyKeyboardBtn.addEventListener('click', applyKeyboard);
    }
}
