// globals.js - Assigns all needed functions to window for inline event handlers

// Components
import { SynthCards } from './components/components.js';
import { singlePhaseWaveformChart, threePhaseWaveformChart } from './components/charts.js';
import { vectorChart } from './components/vectorChart.js';
import { incrementButtons } from './components/incrementButtons.js';
import { selected, setSelected, clearSelected, incrementSelected, resetSelected } from './components/selection.js';

// API
import {
    setSynthAmplitude, setSynthFrequency, setSynthPhase,
    setSynthHarmonics, synthStateEquals, getDefaults,
    setSynthEnabled, setSocket
} from './api.js';

// Synth Handlers
import { 
    incrementVoltage, setVoltageDirect, resetVoltage, 
    incrementCurrent, resetCurrent, setCurrentDirect,
    incrementPhase, setPhaseDirect, resetPhase,
    incrementFrequency, setFrequencyDirect, resetFrequency,
    incrementHarmonic, resetHarmonic
} from './components/synthHandlers.js';

// State Management
import {
    AppState, setSynthState, setOpenOffcanvasId, setSelectedId,
    getSynthState, getOpenOffcanvasId, getSelectedId,
    getVoltageScale, getCurrentScale, getHorizontalScale,
    setVoltageScale, setCurrentScale, setHorizontalScale,
    setPhaseVisibility, getPhaseVisibility, getAllPhaseVisibility,
    updatePhaseVisibilityUI
} from './state.js';

// Utilities
import {
    DPF, THD, truePF, getGlobalFrequencyHz, LoadingSpinner,
    trueRMS, apparentPower, reactivePower, activePower, roundToPrecision,
    VOLTAGE_RMS_MAX, CURRENT_RMS_MAX
} from './utils.js';

// Components
window.SynthCards = SynthCards;
window.singlePhaseWaveformChart = singlePhaseWaveformChart;
window.threePhaseWaveformChart = threePhaseWaveformChart;
window.vectorChart = vectorChart;
window.incrementButtons = incrementButtons;

// Selection
window.selected = selected;
window.setSelected = setSelected;
window.clearSelected = clearSelected;
window.incrementSelected = incrementSelected;
window.resetSelected = resetSelected;

// API
window.setSynthEnabled = setSynthEnabled;
window.setSynthAmplitude = setSynthAmplitude;
window.setSynthFrequency = setSynthFrequency;
window.setSynthPhase = setSynthPhase;
window.setSynthHarmonics = setSynthHarmonics;
window.synthStateEquals = synthStateEquals;
window.getDefaults = getDefaults;
window.setSocket = setSocket;

// Synth Handlers
window.incrementVoltage = incrementVoltage;
window.setVoltageDirect = setVoltageDirect;
window.resetVoltage = resetVoltage;
window.incrementCurrent = incrementCurrent;
window.resetCurrent = resetCurrent;
window.setCurrentDirect = setCurrentDirect;
window.incrementPhase = incrementPhase;
window.setPhaseDirect = setPhaseDirect;
window.resetPhase = resetPhase;
window.incrementFrequency = incrementFrequency;
window.setFrequencyDirect = setFrequencyDirect;
window.resetFrequency = resetFrequency;
window.incrementHarmonic = incrementHarmonic;
window.resetHarmonic = resetHarmonic;

// State Management
window.AppState = AppState;
window.setSynthState = setSynthState;
window.setOpenOffcanvasId = setOpenOffcanvasId;
window.setSelectedId = setSelectedId;
window.getSynthState = getSynthState;
window.getOpenOffcanvasId = getOpenOffcanvasId;
window.getSelectedId = getSelectedId;
window.getVoltageScale = getVoltageScale;
window.getCurrentScale = getCurrentScale;
window.getHorizontalScale = getHorizontalScale;
window.setVoltageScale = setVoltageScale;
window.setCurrentScale = setCurrentScale;
window.setHorizontalScale = setHorizontalScale;
window.setPhaseVisibility = setPhaseVisibility;
window.getPhaseVisibility = getPhaseVisibility;
window.getAllPhaseVisibility = getAllPhaseVisibility;
window.updatePhaseVisibilityUI = updatePhaseVisibilityUI;

// Utilities
window.DPF = DPF;
window.THD = THD;
window.truePF = truePF;
window.trueRMS = trueRMS;
window.apparentPower = apparentPower;
window.reactivePower = reactivePower;
window.activePower = activePower;
window.getGlobalFrequencyHz = getGlobalFrequencyHz;
window.LoadingSpinner = LoadingSpinner;
window.roundToPrecision = roundToPrecision;
window.VOLTAGE_RMS_MAX = VOLTAGE_RMS_MAX;
window.CURRENT_RMS_MAX = CURRENT_RMS_MAX;
