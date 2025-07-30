// Centralized state management for NHP Synth Dashboard
export const AppState = {
    synthState: null,
    openAccordionId: null,
    openOffcanvasId: null,
    selectedId: null,
};

// Optional mutators for clarity and future extensibility
export function setSynthState(newState) {
    AppState.synthState = newState;
}
export function setOpenAccordionId(id) {
    AppState.openAccordionId = id;
}
export function setOpenOffcanvasId(id) {
    AppState.openOffcanvasId = id;
}
export function setSelectedId(id) {
    AppState.selectedId = id;
}

// Optional getters
export function getSynthState() {
    return AppState.synthState;
}
export function getOpenAccordionId() {
    return AppState.openAccordionId;
}
export function getOpenOffcanvasId() {
    return AppState.openOffcanvasId;
}
export function getSelectedId() {
    return AppState.selectedId;
}
