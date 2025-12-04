// app.js - Main Application Controller
import { 
    setOpenOffcanvasId, setSelectedId, getOpenOffcanvasId, getSelectedId,
    AppState, getVoltageScale, getCurrentScale, getHorizontalScale,
    getVoltageOffset, getCurrentOffset, getTimebase, getTimeOffsetMs, updatePhaseVisibilityUI
} from './state.js';
import { setSocket, synthStateEquals, getServiceStatus, getLogs, restartService } from './api.js';
import { SynthCards, ScopeChart, WaveformControl, HarmonicControl } from './components/components.js';
import { threePhaseWaveformChart } from './components/charts.js';
import { LoadingSpinner, debounce, throttle } from './utils.js';
import { errorHandler } from './errorHandler.js';
import { initializeSettings, setupSettingsListeners } from './settings.js';

export class SynthApp {
    constructor() {
        this.socket = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this._logBuffer = [];
        this._autoScroll = true;
        this._socketLogsEnabled = true;
        this._pendingLines = [];
        this._preloadLines = 200; // default; will sync with selector
        this._maxBufferedLines = 2000;
        
        // Create debounced render function to prevent excessive re-renders
        // 100ms delay allows for multiple rapid updates to be batched
        this.debouncedRender = debounce(() => {
            console.debug('Debounced render triggered');
            this.safeRender();
        }, 50);

        // Throttled connection status updates
        this.throttledConnectionUpdate = throttle((connected) => {
            this.updateConnectionStatus(connected);
        }, 100);
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

        // Service status via socket
        this.socket.on('serviceStatus', (status) => {
            const running = typeof status.running === 'string'
                ? status.running.toLowerCase() === 'true'
                : !!status.running;
            const pidVal = status.pid !== undefined && status.pid !== null ? status.pid : '-';
            const indicator = document.getElementById('service-running-indicator');
            const pidSpan = document.getElementById('service-pid');
            if (indicator) {
                indicator.className = running ? 'badge bg-success' : 'badge bg-danger';
                indicator.textContent = running ? 'Running' : 'Stopped';
            }
            if (pidSpan) pidSpan.textContent = pidVal;
        });

        // Service logs stream via socket (incremental)
        this.socket.on('serviceLogs', (payload) => {
            if (!this._socketLogsEnabled) return;
            const pre = document.getElementById('logs-view');
            if (!pre) return;
            if (!pre._scrollInit) {
                pre.addEventListener('scroll', () => {
                    const atBottom = pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 2;
                    const wasAuto = this._autoScroll;
                    this._autoScroll = atBottom;
                    // If user resumed autoscroll, flush pending lines and prune to preload size
                    if (!wasAuto && this._autoScroll) {
                        if (this._pendingLines.length > 0) {
                            // Append pending lines
                            const oldHeight = pre.scrollHeight;
                            this._logBuffer.push(...this._pendingLines);
                            pre.textContent += (pre.textContent ? '\n' : '') + this._pendingLines.join('\n');
                            this._pendingLines = [];
                            // Now prune back to preload size
                            const keep = Math.max(10, this._preloadLines);
                            if (this._logBuffer.length > keep) {
                                this._logBuffer = this._logBuffer.slice(this._logBuffer.length - keep);
                                pre.textContent = this._logBuffer.join('\n');
                            }
                            pre.scrollTop = pre.scrollHeight;
                        }
                    }
                });
                pre._scrollInit = true;
            }
            const lines = Array.isArray(payload?.lines) ? payload.lines : [];
            if (lines.length === 0) return;
            const select = document.getElementById('log-lines');
            if (select) {
                const v = parseInt(select.value || '200');
                if (!isNaN(v)) this._preloadLines = v;
            }

            if (this._autoScroll) {
                // Append
                this._logBuffer.push(...lines);
                // Prune to preload window when autoscrolling
                const keep = Math.max(10, this._preloadLines);
                if (this._logBuffer.length > keep) {
                    this._logBuffer = this._logBuffer.slice(this._logBuffer.length - keep);
                    pre.textContent = this._logBuffer.join('\n');
                } else {
                    pre.textContent += (pre.textContent ? '\n' : '') + lines.join('\n');
                }
                pre.scrollTop = pre.scrollHeight;
            } else {
                // User is inspecting; do not prune. Buffer up to maxBufferedLines.
                if (this._logBuffer.length + lines.length <= this._maxBufferedLines) {
                    this._logBuffer.push(...lines);
                    const oldHeight = pre.scrollHeight;
                    pre.textContent += (pre.textContent ? '\n' : '') + lines.join('\n');
                    // Preserve user's scroll position (no forced movement)
                    pre.scrollTop = Math.max(0, pre.scrollTop);
                } else {
                    // Reached memory cap while paused: queue lines, render when autoscroll resumes
                    this._pendingLines.push(...lines);
                }
            }
        });
    }

    // Setup DOM event listeners
    setupDOMListeners() {
        // Setup fullscreen handler immediately if DOM is ready, or wait for it
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this.renderImmediate();
                this.setupFullscreenHandler();
                this.setupTabHandlers();
                setupSettingsListeners();
                // If Status tab is already open, start its refresh loop
                this.ensureStatusAutoRefresh();
            });
        } else {
            // DOM is already ready
            this.renderImmediate();
            this.setupFullscreenHandler();
            this.setupTabHandlers();
            setupSettingsListeners();
            // If Status tab is already open, start its refresh loop
            this.ensureStatusAutoRefresh();
        }

        // Clicking the connection icon opens the Status view
        const connIcon = document.getElementById('connection-icon');
        if (connIcon) {
            connIcon.style.cursor = 'pointer';
            connIcon.addEventListener('click', () => {
                this.openStatusView();
            });
        }
    }

    // Setup tab handlers for URL hash management
    setupTabHandlers() {
        // Listen for tab changes
        const tabButtons = document.querySelectorAll('[data-bs-toggle="tab"]');
        tabButtons.forEach(button => {
            button.addEventListener('shown.bs.tab', (event) => {
                const targetTab = event.target.getAttribute('data-bs-target');
                const hash = targetTab.replace('#', '').replace('-pane', '');
                
                // Update URL hash without triggering page scroll
                history.replaceState(null, null, '#' + hash);
            });
        });

        // Handle initial hash on page load
        this.handleInitialHash();

        // Handle browser back/forward navigation
        window.addEventListener('hashchange', () => {
            this.handleHashChange();
        });

        const statusBtn = document.getElementById('status-tab');
        if (statusBtn) {
            statusBtn.addEventListener('shown.bs.tab', () => {
                this.refreshStatusAndLogs(true);
                this.startStatusAutoRefresh();
            });
            statusBtn.addEventListener('hide.bs.tab', () => {
                this.stopStatusAutoRefresh();
            });
        }
    }

    async refreshStatusAndLogs(scrollToEnd = false) {
        try {
            const statusResp = await getServiceStatus();
            // Support both flat and nested shapes
            const status = statusResp && statusResp.running !== undefined
                ? statusResp
                : (statusResp && statusResp.status ? statusResp.status : {});
            const running = typeof status.running === 'string'
                ? status.running.toLowerCase() === 'true'
                : !!status.running;
            const pidVal = status.pid !== undefined && status.pid !== null
                ? status.pid
                : (status.pid === 0 ? 0 : '-');
            const indicator = document.getElementById('service-running-indicator');
            const pidSpan = document.getElementById('service-pid');
            if (indicator) {
                indicator.className = running ? 'badge bg-success' : 'badge bg-danger';
                indicator.textContent = running ? 'Running' : 'Stopped';
            }
            if (pidSpan) pidSpan.textContent = pidVal;

            const select = document.getElementById('log-lines');
            const lines = select ? parseInt(select.value || '200') : 200;
            const logsResp = await getLogs(lines);
            const incoming = (logsResp.lines || []);
            const pre = document.getElementById('logs-view');
            if (pre) {
                // Initialize scroll handler once
                if (!pre._scrollInit) {
                    pre.addEventListener('scroll', () => {
                        const atBottom = pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 2;
                        this._autoScroll = atBottom;
                    });
                    pre._scrollInit = true;
                }

                // Determine if we should append or replace
                if (this._logBuffer.length === 0) {
                    this._logBuffer = incoming.slice();
                    pre.textContent = this._logBuffer.join('\n');
                    if (scrollToEnd || this._autoScroll) pre.scrollTop = pre.scrollHeight;
                } else {
                    // Find overlap and append only new lines
                    let newLines = [];
                    // Simple strategy: append lines after the last line we have
                    const lastLine = this._logBuffer[this._logBuffer.length - 1];
                    const idx = incoming.lastIndexOf(lastLine);
                    if (idx >= 0 && idx + 1 < incoming.length) {
                        newLines = incoming.slice(idx + 1);
                    } else if (incoming.length > this._logBuffer.length) {
                        // Fallback: append difference by length
                        newLines = incoming.slice(this._logBuffer.length);
                    } else {
                        // If buffer shrank (rotation/trimming), replace fully
                        this._logBuffer = incoming.slice();
                        const prevScrollRatio = pre.scrollTop / Math.max(1, pre.scrollHeight - pre.clientHeight);
                        pre.textContent = this._logBuffer.join('\n');
                        if (this._autoScroll) pre.scrollTop = pre.scrollHeight;
                        else pre.scrollTop = Math.round(prevScrollRatio * Math.max(0, pre.scrollHeight - pre.clientHeight));
                        return;
                    }

                    if (newLines.length > 0) {
                        this._logBuffer = incoming.slice();
                        // Preserve scroll position if not at bottom by measuring height delta
                        const wasAtBottom = this._autoScroll || scrollToEnd;
                        const oldScrollHeight = pre.scrollHeight;
                        pre.textContent += (pre.textContent ? '\n' : '') + newLines.join('\n');
                        if (wasAtBottom) {
                            pre.scrollTop = pre.scrollHeight;
                        } else {
                            const heightDelta = pre.scrollHeight - oldScrollHeight;
                            pre.scrollTop = Math.max(0, pre.scrollTop);
                            // Keep current viewport; do not force scroll to bottom
                            // No adjustment needed since we appended at end; user's scrollTop remains
                        }
                    }
                }
            }
        } catch (e) {
            const pre = document.getElementById('logs-view');
            if (pre) pre.textContent = `Error loading status/logs: ${e.message}`;
        }
    }

    // Ensure status auto-refresh starts when the status tab exists on load
    ensureStatusAutoRefresh() {
        const statusPane = document.getElementById('status-pane');
        const statusTab = document.getElementById('status-tab');
        if (statusPane && statusTab) {
            // If status tab is currently active, start auto-refresh
            const isActive = statusPane.classList.contains('active') || statusTab.classList.contains('active');
            if (isActive) {
                this.refreshStatusAndLogs(true);
                this.startStatusAutoRefresh();
            }
        }
    }

    startStatusAutoRefresh() {
        if (this._statusInterval) return;
        const btn = document.getElementById('refresh-status-btn');
        if (btn) btn.onclick = () => this.refreshStatusAndLogs(true);
        const select = document.getElementById('log-lines');
        if (select) select.onchange = () => this.refreshStatusAndLogs(true);
        const restartBtn = document.getElementById('restart-service-btn');
        if (restartBtn) {
            restartBtn.onclick = async () => {
                restartBtn.disabled = true;
                try {
                    await restartService();
                } catch (e) {
                    console.error('Restart failed', e);
                } finally {
                    // Give the supervisor a moment, then refresh
                    setTimeout(() => {
                        this.refreshStatusAndLogs(true);
                        restartBtn.disabled = false;
                    }, 2000);
                }
            };
        }
        // Prefer socket updates: disable interval if socket connected
        if (this.socket && this.socket.connected) {
            // One-time fetch to populate initial content
            this.refreshStatusAndLogs(true);
        } else {
            // Fallback polling when socket not connected
            this._statusInterval = setInterval(() => this.refreshStatusAndLogs(false), 2000);
        }
    }

    stopStatusAutoRefresh() {
        if (this._statusInterval) {
            clearInterval(this._statusInterval);
            this._statusInterval = null;
        }
    }

    // Handle initial hash when page loads
    handleInitialHash() {
        const hash = window.location.hash.replace('#', '');
        if (hash) {
            this.activateTab(hash);
        }
    }

    // Handle hash changes (back/forward navigation)
    handleHashChange() {
        const hash = window.location.hash.replace('#', '');
        if (hash) {
            this.activateTab(hash);
        }
    }

    // Activate a specific tab by name
    activateTab(tabName) {
        const tabButton = document.getElementById(`${tabName}-tab`);
        const tabPane = document.getElementById(`${tabName}-pane`);
        
        if (tabButton && tabPane) {
            // Use Bootstrap's tab API to show the tab
            const tab = new bootstrap.Tab(tabButton);
            tab.show();
        }
    }

    // Open the Status pane without needing a tab button
    openStatusView() {
        // Deactivate all panes
        document.querySelectorAll('.tab-pane').forEach(pane => {
            pane.classList.remove('show');
            pane.classList.remove('active');
        });
        const statusPane = document.getElementById('status-pane');
        if (statusPane) {
            statusPane.classList.add('show');
            statusPane.classList.add('active');
            this.refreshStatusAndLogs(true);
            this.startStatusAutoRefresh();
        }
    }

    // Setup fullscreen functionality
    setupFullscreenHandler() {
        const fsBtn = document.getElementById('fullscreen-btn');
        if (fsBtn) {
            fsBtn.addEventListener('click', this.toggleFullscreen.bind(this));
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
        
        // Render waveform control tab content
        const waveformControlContainer = document.getElementById('control-card');
        if (waveformControlContainer) {
            waveformControlContainer.innerHTML = WaveformControl(AppState);
        }
        
        // Render waveforms tab content
        const scopeContainer = document.getElementById('scope-card');
        if (scopeContainer) {
            scopeContainer.innerHTML = '';
            const waveformContent = document.createElement('div');
            waveformContent.innerHTML = ScopeChart(AppState);
            scopeContainer.appendChild(waveformContent.firstElementChild);
        }
        
        // Render harmonics tab content
        const harmonicsContainer = document.getElementById('harmonics-card');
        if (harmonicsContainer) {
            harmonicsContainer.innerHTML = HarmonicControl(AppState);
        }
        
        this.renderWaveforms();
        this.updateUIState();
        this.setupStateListeners();
    }

    // Render all waveform charts
    renderWaveforms() {

        // Three phase waveform if we have enough synths
        if (AppState.synthState.synths.length >= 3) {
            threePhaseWaveformChart(
                AppState.synthState.synths,
                'waveform_three_phase',
                getVoltageScale(),
                getCurrentScale(),
                getTimebase(),
                getTimeOffsetMs(),
                getVoltageOffset(),
                getCurrentOffset()
            );
            
            // Initialize chart drag functionality after chart is rendered
            if (window.initializeChartDrag) {
                window.initializeChartDrag();
            }
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

        // Global click handler to clear selection when clicking elsewhere
        document.addEventListener('click', (event) => {
            // Check if click is on a selectable element, button, or input
            const isSelectable = event.target.closest('.selectable');
            const isButton = event.target.closest('button') || event.target.tagName === 'BUTTON';
            const isInput = event.target.tagName === 'INPUT';
            const isIcon = event.target.closest('.bi') || event.target.classList.contains('bi');
            
            // If click is not on any interactive element, clear selection
            if (!isSelectable && !isButton && !isInput && !isIcon && window.selected) {
                // Clear the UI selection (from selection.js)
                if (window.clearSelected) {
                    window.clearSelected();
                }
                // Also clear the old selection system if it exists
                if (getSelectedId()) {
                    setSelectedId(null);
                    document.querySelectorAll('.selectable').forEach(el => {
                        el.classList.remove('selected');
                    });
                }
            }
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
