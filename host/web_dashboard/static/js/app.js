// app.js - Main Application Controller
import { 
    setOpenOffcanvasId, setSelectedId, getOpenOffcanvasId, getSelectedId,
    AppState, getVoltageScale, getCurrentScale, getHorizontalScale,
    updatePhaseVisibilityUI
} from './state.js';
import { setSocket, synthStateEquals } from './api.js';
import { SynthCards } from './components/components.js';
import { singlePhaseWaveformChart, threePhaseWaveformChart } from './components/charts.js';
import { LoadingSpinner, debounce, throttle } from './utils.js';
import { errorHandler } from './errorHandler.js';
import { initializeSettings, setupSettingsListeners } from './settings.js';

export class SynthApp {
    constructor() {
        this.socket = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        
        // Create debounced render function to prevent excessive re-renders
        // 100ms delay allows for multiple rapid updates to be batched
        this.debouncedRender = debounce(() => {
            console.debug('Debounced render triggered');
            this.safeRender();
        }, 100);

        // Throttled connection status updates
        this.throttledConnectionUpdate = throttle((connected) => {
            this.updateConnectionStatus(connected);
        }, 500);
    }

    // Initialize the application
    async init() {
        // Initialize settings first (async)
        await initializeSettings();
        
        // Initialize state
        setOpenOffcanvasId(null);
        setSelectedId(null);
        this.setupSocket();
        this.setupDOMListeners();
        // Use immediate render for initial app setup
        this.renderImmediate();
    }

    // Setup Socket.IO connection and handlers
    setupSocket() {
        this.socket = io();
        setSocket(this.socket);

        // Connection status handlers
        this.socket.on('connect', () => {
            console.log('Socket connected');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.throttledConnectionUpdate(true);
            errorHandler.logSuccess('Connected to synthesizers');
        });

        this.socket.on('disconnect', () => {
            console.log('Socket disconnected');
            this.isConnected = false;
            this.throttledConnectionUpdate(false);
            errorHandler.logError('Disconnected from synthesizers', 'warning');
        });

        this.socket.on('connect_error', (error) => {
            console.log('Socket connection error:', error);
            this.isConnected = false;
            this.reconnectAttempts++;
            this.throttledConnectionUpdate(false);
            
            if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                errorHandler.logError('Failed to connect after multiple attempts', 'error');
            }
        });

        // Data handlers
        this.socket.on('synthState', (data) => {
            if (!synthStateEquals(AppState.synthState, data)) {
                // Assign synthetic id if missing
                if (data && Array.isArray(data.synths)) {
                    data.synths.forEach((synth, idx) => {
                        if (typeof synth.id === 'undefined') {
                            synth.id = idx;
                        }
                    });
                }
                AppState.synthState = data;
                // Use debounced render to prevent excessive re-renders during rapid updates
                this.debouncedRender();
            }
        });
    }

    // Setup DOM event listeners
    setupDOMListeners() {
        document.addEventListener('DOMContentLoaded', () => {
            // Use immediate render for initial page load
            this.renderImmediate();
            this.setupFullscreenHandler();
            // Setup settings listeners after DOM is ready
            setupSettingsListeners();
        });
    }

    // Setup fullscreen functionality
    setupFullscreenHandler() {
        const fsBtn = document.getElementById('fullscreen-btn');
        if (fsBtn) {
            fsBtn.addEventListener('click', this.toggleFullscreen);
        }

        // Update fullscreen icon when state changes
        const updateFullscreenIcon = () => {
            const icon = document.getElementById('fullscreen-icon');
            if (!icon) return;
            if (document.fullscreenElement) {
                icon.innerHTML = '<span class="bi bi-fullscreen-exit"></span>';
            } else {
                icon.innerHTML = '<span class="bi bi-fullscreen"></span>';
            }
        };

        document.addEventListener('fullscreenchange', updateFullscreenIcon);
        document.addEventListener('webkitfullscreenchange', updateFullscreenIcon);
        document.addEventListener('mozfullscreenchange', updateFullscreenIcon);
        document.addEventListener('MSFullscreenChange', updateFullscreenIcon);
    }

    // Main render function with error boundary
    render() {
        const cardsContainer = document.getElementById('synth-cards');
        if (!cardsContainer) return;

        if (AppState.synthState && AppState.synthState.synths) {
            this.renderSynthContent(cardsContainer);
        } else {
            cardsContainer.innerHTML = LoadingSpinner();
        }
    }

    // Safe render with error handling
    safeRender() {
        errorHandler.safeRender(() => this.render());
    }

    // Force immediate render (use for initial load or user interactions)
    renderImmediate() {
        this.safeRender();
    }

    // Render synth-specific content
    renderSynthContent(cardsContainer) {
        // Render synth cards
        cardsContainer.innerHTML = SynthCards(AppState);
        this.renderWaveforms();
        this.updateUIState();
        this.setupStateListeners();
    }

    // Render all waveform charts
    renderWaveforms() {
        // Single phase waveforms for each synth
        AppState.synthState.synths.forEach((synth, idx) => {
            singlePhaseWaveformChart(synth, `waveform_single_phase_${idx}`);
        });

        // Three phase waveform if we have enough synths
        if (AppState.synthState.synths.length >= 3) {
            threePhaseWaveformChart(
                AppState.synthState.synths,
                'waveform_three_phase',
                getVoltageScale(),
                getCurrentScale(),
                getHorizontalScale()
            );
        }
        updatePhaseVisibilityUI();
    }

    // Update UI state (restore selections, offcanvas, etc.)
    updateUIState() {
        // Restore selected input group
        if (AppState.selectedId) {
            const selectedElement = document.getElementById(AppState.selectedId);
            if (selectedElement) {
                selectedElement.classList.add('selected');
            }
        }
        this.restoreOffcanvasState();
    }

    // Restore offcanvas state without animation
    restoreOffcanvasState() {
        if (!AppState.openOffcanvasId) return;

        const offcanvasElem = document.getElementById(AppState.openOffcanvasId);
        if (offcanvasElem && !offcanvasElem.classList.contains('show')) {
            // Temporarily disable transition
            const prevTransition = offcanvasElem.style.transition;
            offcanvasElem.style.transition = 'none';

            // Show offcanvas
            const bsOffcanvas = bootstrap.Offcanvas.getOrCreateInstance(offcanvasElem);
            bsOffcanvas.show();

            // Force reflow and restore transition
            void offcanvasElem.offsetWidth;
            setTimeout(() => {
                offcanvasElem.style.transition = prevTransition;
            }, 10);
        }
    }

    // Setup state listeners for UI elements
    setupStateListeners() {
        this.setupOffcanvasListeners();
        this.setupSelectionListeners();
    }

    // Setup offcanvas event listeners
    setupOffcanvasListeners() {
        document.querySelectorAll('.offcanvas').forEach(offcanvas => {
            offcanvas.addEventListener('show.bs.offcanvas', function () {
                setOpenOffcanvasId(this.id);
            });
            offcanvas.addEventListener('hide.bs.offcanvas', function () {
                if (getOpenOffcanvasId() === this.id) {
                    setOpenOffcanvasId(null);
                }
            });
        });
    }

    // Setup selection event listeners
    setupSelectionListeners() {
        document.querySelectorAll('.selectable').forEach(element => {
            element.addEventListener('click', function () {
                const currentId = getSelectedId();
                if (currentId === this.id) {
                    setSelectedId(null); // Deselect if already selected
                } else {
                    setSelectedId(this.id); // Select this group
                    // Deselect other groups
                    document.querySelectorAll('.selectable').forEach(otherSelectable => {
                        if (otherSelectable !== this) {
                            otherSelectable.classList.remove('selected');
                        }
                    });
                    this.classList.add('selected');
                }
            });
        });
    }

    // Update connection status indicator
    updateConnectionStatus(connected) {
        const statusElement = document.getElementById('connection-status');
        const iconElement = document.getElementById('connection-icon');
        if (statusElement && iconElement) {
            if (connected) {
                iconElement.className = 'bi bi-ethernet text-success fs-4';
                statusElement.title = 'Socket Connected';
            } else {
                iconElement.className = 'bi bi-ethernet text-danger fs-4';
                statusElement.title = 'Socket Disconnected';
            }
        }
    }

    // Toggle fullscreen mode
    toggleFullscreen() {
        const doc = window.document;
        const docEl = doc.documentElement;
        
        if (!doc.fullscreenElement && !doc.webkitFullscreenElement && 
            !doc.mozFullScreenElement && !doc.msFullscreenElement) {
            // Enter fullscreen
            if (docEl.requestFullscreen) {
                docEl.requestFullscreen();
            } else if (docEl.mozRequestFullScreen) {
                docEl.mozRequestFullScreen();
            } else if (docEl.webkitRequestFullscreen) {
                docEl.webkitRequestFullscreen();
            } else if (docEl.msRequestFullscreen) {
                docEl.msRequestFullscreen();
            }
        } else {
            // Exit fullscreen
            if (doc.exitFullscreen) {
                doc.exitFullscreen();
            } else if (doc.mozCancelFullScreen) {
                doc.mozCancelFullScreen();
            } else if (doc.webkitExitFullscreen) {
                doc.webkitExitFullscreen();
            } else if (doc.msExitFullscreen) {
                doc.msExitFullscreen();
            }
        }
    }
}
