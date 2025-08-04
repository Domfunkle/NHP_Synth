// globals.js - Global window assignments for inline event handlers and dynamic components
// NOTE: This file is required because components.js generates HTML with inline onclick handlers
// and state.js calls chart functions dynamically. Future refactoring could eliminate this
// by using event delegation and direct imports.

// Components
import { SynthCards } from './components/components.js';
import { singlePhaseWaveformChart, threePhaseWaveformChart } from './components/charts.js';
import { vectorChart } from './components/vectorChart.js';
import { incrementButtons } from './components/incrementButtons.js';
import { setSelected, clearSelected, selected, incrementSelected, resetSelected } from './components/selection.js';

// API
import { 
    setSynthEnabled, setSocket, setSynthAmplitude, setSynthFrequency, setSynthPhase,
    getDefaults, setSynthHarmonics
} from './api.js';

// Settings Management
import {
    initializeSettings, getSettings, getSetting, setSetting, updateSettings,
    resetSettings, saveSettingsToServer, setupSettingsListeners,
    getMaxVoltage, getMaxCurrent, isDebugMode, getChartRefreshRate, getPrecisionDigits,
    getSynthAutoOn, getSynthAutoOnForIndex
} from './settings.js';

// Synth Handlers (used in onblur/onkeydown attributes)
import {
    setVoltageDirect, setCurrentDirect, setPhaseDirect, setFrequencyDirect,
    incrementVoltage, incrementCurrent, incrementPhase, incrementFrequency,
    resetVoltage, resetCurrent, resetPhase, resetFrequency,
    incrementHarmonic, resetHarmonic
} from './components/synthHandlers.js';

// State Management  
import {
    AppState, setOpenOffcanvasId, setSelectedId,
    getOpenOffcanvasId, getSelectedId, getSynthState,
    getVoltageScale, getCurrentScale, getHorizontalScale,
    setVoltageScale, setCurrentScale, setHorizontalScale,
    setPhaseVisibility, getPhaseVisibility,
    updatePhaseVisibilityUI
} from './state.js';

// Utilities (used in component templates)
import {
    roundToPrecision, apparentPower, reactivePower, activePower,
    VOLTAGE_RMS_MAX, CURRENT_RMS_MAX, THD, DPF, truePF, debounce,
    throttle, formatValue, clamp
} from './utils.js';

// === COMPONENT FUNCTIONS (used in generated HTML) ===
window.SynthCards = SynthCards;
window.singlePhaseWaveformChart = singlePhaseWaveformChart;
window.threePhaseWaveformChart = threePhaseWaveformChart;
window.vectorChart = vectorChart;
window.incrementButtons = incrementButtons;

// === SELECTION HANDLERS (used in onclick attributes) ===
window.setSelected = setSelected;
window.clearSelected = clearSelected;
window.selected = selected;
window.incrementSelected = incrementSelected;
window.resetSelected = resetSelected;

// === API FUNCTIONS (used in onclick attributes) ===
window.setSynthEnabled = setSynthEnabled;
window.setSocket = setSocket;
window.setSynthAmplitude = setSynthAmplitude;
window.setSynthFrequency = setSynthFrequency;
window.setSynthPhase = setSynthPhase;
window.getDefaults = getDefaults;
window.setSynthHarmonics = setSynthHarmonics;

// === SYNTH HANDLERS (used in onblur/onkeydown attributes) ===
window.setVoltageDirect = setVoltageDirect;
window.setCurrentDirect = setCurrentDirect;
window.setPhaseDirect = setPhaseDirect;
window.setFrequencyDirect = setFrequencyDirect;
window.incrementVoltage = incrementVoltage;
window.incrementCurrent = incrementCurrent;
window.incrementPhase = incrementPhase;
window.incrementFrequency = incrementFrequency;
window.resetVoltage = resetVoltage;
window.resetCurrent = resetCurrent;
window.resetPhase = resetPhase;
window.resetFrequency = resetFrequency;
window.incrementHarmonic = incrementHarmonic;
window.resetHarmonic = resetHarmonic;

// === STATE MANAGEMENT (used in onclick attributes and dynamic calls) ===
window.AppState = AppState;
window.setOpenOffcanvasId = setOpenOffcanvasId;
window.setSelectedId = setSelectedId;
window.getOpenOffcanvasId = getOpenOffcanvasId;
window.getSelectedId = getSelectedId;
window.getSynthState = getSynthState;

// === CHART SCALING (used in onclick attributes) ===
window.getVoltageScale = getVoltageScale;
window.getCurrentScale = getCurrentScale;
window.getHorizontalScale = getHorizontalScale;
window.setVoltageScale = setVoltageScale;
window.setCurrentScale = setCurrentScale;
window.setHorizontalScale = setHorizontalScale;

// === PHASE VISIBILITY (used in onclick attributes) ===
window.setPhaseVisibility = setPhaseVisibility;
window.getPhaseVisibility = getPhaseVisibility;
window.updatePhaseVisibilityUI = updatePhaseVisibilityUI;

// === UTILITY FUNCTIONS (used in component templates) ===
window.roundToPrecision = roundToPrecision;
window.apparentPower = apparentPower;
window.reactivePower = reactivePower;
window.activePower = activePower;
window.VOLTAGE_RMS_MAX = VOLTAGE_RMS_MAX;
window.CURRENT_RMS_MAX = CURRENT_RMS_MAX;
window.THD = THD;
window.DPF = DPF;
window.truePF = truePF;
window.debounce = debounce;
window.throttle = throttle;
window.formatValue = formatValue;
window.clamp = clamp;

// === SETTINGS MANAGEMENT (used in onclick attributes and dynamic calls) ===
window.initializeSettings = initializeSettings;
window.getSettings = getSettings;
window.getSetting = getSetting;
window.setSetting = setSetting;
window.updateSettings = updateSettings;
window.resetSettings = resetSettings;
window.saveSettings = saveSettingsToServer;
window.setupSettingsListeners = setupSettingsListeners;
window.getMaxVoltage = getMaxVoltage;
window.getMaxCurrent = getMaxCurrent;
window.isDebugMode = isDebugMode;
window.getChartRefreshRate = getChartRefreshRate;
window.getPrecisionDigits = getPrecisionDigits;
window.getSynthAutoOn = getSynthAutoOn;
window.getSynthAutoOnForIndex = getSynthAutoOnForIndex;
