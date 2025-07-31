// globals.js - Assigns all needed functions to window for inline event handlers

// Components
import { SynthCardsRow } from './components/components.js';
import { synthWaveformChart } from './components/charts.js';
import { harmonicsCells } from './components/harmonicsCells.js';
import { incrementButtons } from './components/incrementButtons.js';
import { selected, setSelected, clearSelected, incrementSelected, resetSelected } from './components/selection.js';

// API
import {
    setSynthAmplitude, setSynthFrequency, setSynthPhase,
    setSynthHarmonics, synthStateEquals, getDefaults,setSocket
} from './api.js';

// Synth Handlers
import { 
    incrementVoltage, setVoltageDirect, resetVoltage, 
    incrementCurrent, resetCurrent, setCurrentDirect,
    incrementPhase, setPhaseDirect, resetPhase,
    incrementFrequency, setFrequencyDirect, resetFrequency, incrementHarmonic
} from './components/synthHandlers.js';

// State Management
import {
    AppState, setSynthState, setOpenAccordionId,
    setOpenOffcanvasId, setSelectedId, getSynthState,
    getOpenAccordionId, getOpenOffcanvasId, getSelectedId
} from './state.js';

// Utilities
import { DPF, THD, truePF, getGlobalFrequencyHz, LoadingSpinner } from './utils.js';

// Components
window.SynthCardsRow = SynthCardsRow;
window.synthWaveformChart = synthWaveformChart;
window.harmonicsCells = harmonicsCells;
window.incrementButtons = incrementButtons;

// Selection
window.selected = selected;
window.setSelected = setSelected;
window.clearSelected = clearSelected;
window.incrementSelected = incrementSelected;
window.resetSelected = resetSelected;

// API
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

// State Management
window.AppState = AppState;
window.setSynthState = setSynthState;
window.setOpenAccordionId = setOpenAccordionId;
window.setOpenOffcanvasId = setOpenOffcanvasId;
window.setSelectedId = setSelectedId;
window.getSynthState = getSynthState;
window.getOpenAccordionId = getOpenAccordionId;
window.getOpenOffcanvasId = getOpenOffcanvasId;
window.getSelectedId = getSelectedId;

// Utilities
window.DPF = DPF;
window.THD = THD;
window.truePF = truePF;
window.getGlobalFrequencyHz = getGlobalFrequencyHz;
window.LoadingSpinner = LoadingSpinner;
