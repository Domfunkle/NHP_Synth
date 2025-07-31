// globals.js - Assigns all needed functions to window for inline event handlers

import { setSelected, clearSelected, incrementSelected, resetSelected, SynthCardsRow, LoadingSpinner } from './components/components.js';
import { setSynthAmplitude, setSynthFrequency, setSynthPhase, setSynthHarmonics, synthStateEquals, getDefaults, setSocket } from './api.js';
import { synthWaveformChart } from './components/charts.js';
import { harmonicsCells } from './components/harmonicsCells.js';
import { incrementButtons } from './components/incrementButtons.js';
import { incrementVoltage, setVoltageDirect, resetVoltage, incrementCurrent, resetCurrent, incrementPhase, setPhaseDirect, resetPhase, incrementFrequency, setFrequencyDirect, resetFrequency, incrementHarmonic, setCurrentDirect } from './components/synthHandlers.js';
import { AppState, setSynthState, setOpenAccordionId, setOpenOffcanvasId, setSelectedId, getSynthState, getOpenAccordionId, getOpenOffcanvasId, getSelectedId } from './state.js';
import { DPF, THD, truePF, getGlobalFrequencyHz } from './utils.js';

// Components
window.setSelected = setSelected;
window.clearSelected = clearSelected;
window.incrementSelected = incrementSelected;
window.resetSelected = resetSelected;
window.SynthCardsRow = SynthCardsRow;
window.LoadingSpinner = LoadingSpinner;

// Charts
window.synthWaveformChart = synthWaveformChart;

// Harmonics
window.harmonicsCells = harmonicsCells;

// Increment buttons
window.incrementButtons = incrementButtons;

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
window.incrementPhase = incrementPhase;
window.setPhaseDirect = setPhaseDirect;
window.resetPhase = resetPhase;
window.incrementFrequency = incrementFrequency;
window.setFrequencyDirect = setFrequencyDirect;
window.resetFrequency = resetFrequency;
window.incrementHarmonic = incrementHarmonic;
window.setCurrentDirect = setCurrentDirect;

// State management
window.AppState = AppState;
window.setSynthState = setSynthState;
window.setOpenAccordionId = setOpenAccordionId;
window.setOpenOffcanvasId = setOpenOffcanvasId;
window.setSelectedId = setSelectedId;
window.getSynthState = getSynthState;
window.getOpenAccordionId = getOpenAccordionId;
window.getOpenOffcanvasId = getOpenOffcanvasId;
window.getSelectedId = getSelectedId;

// Utility functions
window.DPF = DPF;
window.THD = THD;
window.truePF = truePF;
window.getGlobalFrequencyHz = getGlobalFrequencyHz;