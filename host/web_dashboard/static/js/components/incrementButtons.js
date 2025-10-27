

export function incrementButtons() {
    // Store current adjustment index in window
    if (window.incrementAdjustmentIndex === undefined) window.incrementAdjustmentIndex = 0;
    const type = window.selected.type;

    let levels = [10, 1, 0.1];
    if (type?.startsWith('harmonic_order_')) {
        levels = [2, 10];
    } else if (type?.startsWith('harmonic_amp_')) {
        levels = [5, 1, 0.1];
    } else if (type?.startsWith('harmonic_phase_') || type === 'phase') {
        levels = [45, 30, 5, 1, 0.1];
    } else if (type === 'current') {
        levels = [1, 0.1, 0.01];
    } else if (type === 'voltage') {
        levels = [10, 1, 0.1];
    }

    const adjustment = levels[window.incrementAdjustmentIndex];

    // Toggle function
    window.toggleIncrementAdjustment = function () {
        window.incrementAdjustmentIndex = (window.incrementAdjustmentIndex + 1) % levels.length;
        // Re-render buttons if needed
        document.querySelectorAll('[id^="increment_buttons_"]').forEach(e => e.innerHTML = incrementButtons());
    };

    return `
        <div class="vstack gap-4 my-2">
            <button class="btn btn-outline-info p-2 btn-lg fs-1" type="button"
                style="height:80px;"
                onclick="incrementSelected(${adjustment})">
                <span class="bi bi-arrow-up"></span>
            </button>
            <button class="btn btn-outline-info p-2 btn-lg fs-1" type="button"
                style="height:80px;"
                onclick="incrementSelected(${-adjustment})">
                <span class="bi bi-arrow-down"></span>
            </button>
            <button class="btn btn-outline-light p-2 btn-lg fs-3" type="button"
                style="height:80px;"
                onclick="toggleIncrementAdjustment()">
                <nobr><i class="bi bi-plus-slash-minus"></i> ${adjustment}</nobr>
            </button>
            <button class="btn btn-outline-danger p-2 btn-lg fs-1" type="button"
                style="height:80px;"
                onclick="resetSelected()">
                <span class="bi bi-arrow-clockwise"></span>
            </button>
        </div>
    `;
}
;
