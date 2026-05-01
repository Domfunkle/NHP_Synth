let targetInput = null;
let modal = null;
let display = null;
let bsModal = null;

function shouldUseTouchNumpad(input) {
    if (!(input instanceof HTMLInputElement)) return false;
    if (input.disabled || input.readOnly) return false;
    if (input.type === 'number') return true;
    if (input.type === 'text') {
        const id = input.id || '';
        return /^(voltage_input_|current_input_|phase_input_|frequency_input_|harmonic_)/.test(id);
    }
    return false;
}

function clampToInputBounds(value, input) {
    let v = value;
    if (input.min !== '') {
        const min = parseFloat(input.min);
        if (!Number.isNaN(min)) v = Math.max(v, min);
    }
    if (input.max !== '') {
        const max = parseFloat(input.max);
        if (!Number.isNaN(max)) v = Math.min(v, max);
    }
    return v;
}

function setDisplayValue(next) {
    if (!display) return;
    display.value = String(next);
}

function currentNumericValue() {
    if (!display || display.value.trim() === '' || display.value === '-') return 0;
    const parsed = parseFloat(display.value);
    return Number.isNaN(parsed) ? 0 : parsed;
}

function applyStep(step) {
    const next = currentNumericValue() + step;
    const clamped = targetInput ? clampToInputBounds(next, targetInput) : next;
    setDisplayValue(clamped);
}

function appendDigit(digit) {
    if (!display) return;
    const current = display.value || '';
    if (digit === '.' && current.includes('.')) return;
    if (current === '0' && digit !== '.') {
        setDisplayValue(digit);
        return;
    }
    if (current === '-0' && digit !== '.') {
        setDisplayValue('-' + digit);
        return;
    }
    setDisplayValue(current + digit);
}

function toggleSign() {
    if (!display) return;
    const v = display.value || '';
    if (v.startsWith('-')) setDisplayValue(v.slice(1));
    else setDisplayValue('-' + v);
}

function backspace() {
    if (!display) return;
    const v = display.value || '';
    setDisplayValue(v.slice(0, -1));
}

function clearDisplay() {
    setDisplayValue('');
}

function commitValue() {
    if (!targetInput || !display) return;
    const raw = display.value.trim();
    if (raw === '' || raw === '-') return;

    const parsed = parseFloat(raw);
    if (Number.isNaN(parsed)) return;

    const clamped = clampToInputBounds(parsed, targetInput);
    targetInput.value = String(clamped);
    targetInput.dispatchEvent(new Event('input', { bubbles: true }));
    targetInput.dispatchEvent(new Event('change', { bubbles: true }));
    targetInput.dispatchEvent(new Event('blur', { bubbles: true }));
}

function openForInput(input) {
    targetInput = input;
    const starting = input.value === '' ? '0' : input.value;
    setDisplayValue(starting);
    bsModal.show();
}

export function initTouchNumpad() {
    modal = document.getElementById('touch-numpad-modal');
    display = document.getElementById('touch-numpad-display');
    if (!modal || !display || typeof bootstrap === 'undefined') return;

    bsModal = bootstrap.Modal.getOrCreateInstance(modal, {
        backdrop: true,
        keyboard: true
    });

    document.addEventListener('click', (event) => {
        const input = event.target.closest('input');
        if (!shouldUseTouchNumpad(input)) return;
        event.preventDefault();
        openForInput(input);
    });

    modal.addEventListener('click', (event) => {
        const digit = event.target.getAttribute('data-numpad-digit');
        if (digit !== null) {
            appendDigit(digit);
            return;
        }

        const stepAttr = event.target.getAttribute('data-numpad-step');
        if (stepAttr !== null) {
            const step = parseFloat(stepAttr);
            if (!Number.isNaN(step)) applyStep(step);
            return;
        }

        const action = event.target.getAttribute('data-numpad-action');
        if (!action) return;
        if (action === 'toggle-sign') toggleSign();
        if (action === 'backspace') backspace();
        if (action === 'clear') clearDisplay();
    });

    const applyBtn = document.getElementById('touch-numpad-apply');
    if (applyBtn) {
        applyBtn.addEventListener('click', () => {
            commitValue();
            bsModal.hide();
        });
    }
}
