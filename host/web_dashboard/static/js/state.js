// Centralized state management for NHP Synth Dashboard
export const AppState = {
    synthstate: null,
    openAccordionId: null,
    openOffcanvasId: null,
    selectedId: null,
};

// Optional mutators for clarity and future extensibility
export function setSynthState(newState) {
    AppState.synthstate = newState;
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
    return AppState.synthstate;
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
