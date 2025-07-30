// Centralized state management for NHP Synth Dashboard
export const AppState = {
    synthstate: null,
    openAccordionId: null,
    openOffcanvasId: null,
    selectedInputGroupId: null,
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
export function setSelectedInputGroupId(id) {
    AppState.selectedInputGroupId = id;
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
export function getSelectedInputGroupId() {
    return AppState.selectedInputGroupId;
}
