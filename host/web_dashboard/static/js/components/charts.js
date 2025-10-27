// Chart rendering for NHP Synth Dashboard
// Exported as ES module

// Oscilloscope grid plugin for Chart.js
const oscilloscopeGridPlugin = {
    id: 'oscilloscopeGrid',
    beforeDraw: (chart) => {
        const ctx = chart.ctx;
        const canvas = chart.canvas;
        const chartArea = chart.chartArea;
        
        // Save canvas state
        ctx.save();
        
        // Set dark oscilloscope background
        ctx.fillStyle = '#001100aa';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw major grid lines (bright green)
        ctx.strokeStyle = '#00aa00';
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.6;
        
        // Calculate the actual center of the chart area
        const centerX = chartArea.left + (chartArea.right - chartArea.left) / 2;
        
        // Vertical major divisions - centered around the actual center line
        const gridSpacing = (chartArea.right - chartArea.left) / 8; // 8 major divisions
        
        // Draw major vertical lines centered around the center line
        for (let i = -4; i <= 4; i++) {
            const x = centerX + (i * gridSpacing);
            if (x >= chartArea.left && x <= chartArea.right) {
                ctx.beginPath();
                ctx.moveTo(x, chartArea.top);
                ctx.lineTo(x, chartArea.bottom);
                ctx.stroke();
            }
        }
        
        // Horizontal major divisions (static grid - 10 divisions total)
        const horizontalDivisions = 10;
        for (let i = 0; i <= horizontalDivisions; i++) {
            const yPercent = (i / horizontalDivisions);
            const y = chartArea.top + (chartArea.bottom - chartArea.top) * yPercent;
            
            ctx.beginPath();
            ctx.moveTo(chartArea.left, y);
            ctx.lineTo(chartArea.right, y);
            ctx.stroke();
        }
               
        // Draw center crosshairs (bright green)
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 1;
        
        // Center vertical line (at x=0 degrees) - this is the main center reference
        ctx.beginPath();
        ctx.moveTo(centerX, chartArea.top);
        ctx.lineTo(centerX, chartArea.bottom);
        ctx.stroke();
        
        // Center horizontal line (static center)
        const centerY = chartArea.top + (chartArea.bottom - chartArea.top) / 2;
        ctx.beginPath();
        ctx.moveTo(chartArea.left, centerY);
        ctx.lineTo(chartArea.right, centerY);
        ctx.stroke();
        
        // Restore canvas state
        ctx.restore();
    },
    afterDraw: (chart) => {
        const ctx = chart.ctx;
        const chartArea = chart.chartArea;
        
        // Save canvas state
        ctx.save();
        
        // Add oscilloscope division labels
        ctx.fillStyle = '#00ff00';
        ctx.font = '18px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        
        // Get scale information from chart options or defaults
        const scales = chart.options.scales;
        
        // Calculate actual ms/div from the timebase setting
        const msPerDiv = window.getTimebase ? window.getTimebase() : 10.0;
        
        // Get current time offset from global state
        const timeOffsetMs = window.AppState ? window.AppState.timeOffsetMs : 0;
        
        // Get current vertical offsets from global state
        const voltageOffsetV = window.AppState ? window.AppState.voltageOffsetV : 0;
        const currentOffsetA = window.AppState ? window.AppState.currentOffsetA : 0;
        
        // Get current V/div and A/div directly from state (which are already the proper oscilloscope values)
        const voltagePerDiv = window.getVoltageScale ? window.getVoltageScale() : 1.0; // This is now the actual V/div value
        const currentPerDiv = window.getCurrentScale ? window.getCurrentScale() : 0.1; // This is now the actual A/div value
        
        // Draw 2x2 grid in top-left for voltage information
        const topLeftX = chartArea.left;
        const topLeftY = chartArea.top + 10;
        const columnWidth = 120;
        
        // First row: V/div and V offset
        ctx.fillText(`${voltagePerDiv.toFixed(voltagePerDiv < 1 ? 1 : 0).padStart(6, ' ')} V/div`, topLeftX, topLeftY);
        const voltageOffsetSign = voltageOffsetV >= 0 ? '+' : '-';
        ctx.fillText(`${voltageOffsetSign}${Math.abs(voltageOffsetV).toFixed(1).padStart(5, ' ')} V`, topLeftX + columnWidth, topLeftY);
        
        // Second row: A/div and A offset (if current scales exist)
        if (scales.yI) {
            ctx.fillText(`${currentPerDiv.toFixed(currentPerDiv < 1 ? 2 : 1).padStart(6, ' ')} A/div`, topLeftX + 380, topLeftY);
            const currentOffsetSign = currentOffsetA >= 0 ? '+' : '-';
            ctx.fillText(`${currentOffsetSign}${Math.abs(currentOffsetA).toFixed(1).padStart(5, ' ')} A`, topLeftX + 380 + columnWidth, topLeftY);
        }
        
        // Draw 1x2 grid at bottom for horizontal information
        const bottomLeftX = chartArea.left
        const bottomLeftY = chartArea.bottom - 20;
        
        // Timebase
        if (msPerDiv >= 1) {
            ctx.fillText(`${Math.round(msPerDiv).toString().padStart(4, ' ')} ms/div`, bottomLeftX, bottomLeftY);
        } else {
            ctx.fillText(`${Math.round(msPerDiv * 1000).toString().padStart(5, ' ')} μs/div`, bottomLeftX, bottomLeftY);
        }
        
        // Time offset
        if (Math.abs(timeOffsetMs) < 1) {
            const timeOffsetSign = timeOffsetMs >= 0 ? '+' : '-';
            ctx.fillText(`${timeOffsetSign}${Math.abs(timeOffsetMs * 1000).toFixed(0).padStart(4, ' ')} μs`, bottomLeftX + columnWidth, bottomLeftY);
        } else {
            const timeOffsetSign = timeOffsetMs >= 0 ? '+' : '-';
            ctx.fillText(`${timeOffsetSign}${Math.abs(timeOffsetMs).toFixed(1).padStart(5, ' ')} ms`, bottomLeftX + columnWidth, bottomLeftY);
        }
        
        // Restore canvas state
        ctx.restore();
    }
};

// Register the plugin
Chart.register(oscilloscopeGridPlugin);

/**
 * Generates a three-phase waveform chart for the given synthesizers.
 * @param {Array} synths - Array of synthesizer objects.
 * @param {string} canvasId - ID of the canvas element to render the chart.
 * @param {number} voltage_scale - Scale factor for voltage controls V/div (default 100)
 * @param {number} current_scale - Scale factor for current controls A/div (default 2.
 * @param {number} timebaseMs - Timebase in milliseconds controls ms/div (default 20).
 * @param {number} timeOffsetMs - Time offset in milliseconds (default 0).
 * @param {number} voltageOffsetV - Voltage offset in volts (default 0).
 * @param {number} currentOffsetA - Current offset in amperes (default 0).
 */

export function threePhaseWaveformChart(synths, canvasId, voltage_scale = 100, current_scale = 2, timebaseMs = 20, timeOffsetMs = 0, voltageOffsetV = 0, currentOffsetA = 0) {
    const phaseLabels = ['L1', 'L2', 'L3'];
    const phaseSynths = [synths[0], synths[1], synths[2]];
    
    if (!phaseSynths[0] || !phaseSynths[1] || !phaseSynths[2]) return;

    const sqrt2 = Math.sqrt(2);
    const frequency = phaseSynths[0].frequency_a;
       
    // Calculate total time span: 8 divisions × timebase
    const totalTimeMs = 8 * timebaseMs;
    const totalTimeSeconds = totalTimeMs / 1000;
    
    // Calculate Y-axis ranges based on V/div and A/div (10 divisions total = 5 above and 5 below center)
    const voltageMax = voltage_scale * 5; // 5 divisions above center
    const currentMax = current_scale * 5; // 5 divisions above center

    // Calculate amplitudes and phases for all phases using loops
    const phaseData = phaseLabels.map((label, i) => {
        const synth = phaseSynths[i];
        return {
            label,
            voltage: {
                amplitude: (synth.amplitude_a / 100) * VOLTAGE_RMS_MAX * sqrt2, // Peak voltage in volts
                phase: synth.phase_a,
                harmonics: synth.harmonics_a,
                visible: getPhaseVisibility(label, 'voltage')
            },
            current: {
                amplitude: (synth.amplitude_b / 100) * CURRENT_RMS_MAX * sqrt2, // Peak current in amperes
                phase: synth.phase_b,
                harmonics: synth.harmonics_b,
                visible: getPhaseVisibility(label, 'current')
            }
        };
    });

    const N = 1000;
    const x = Array.from({ length: N }, (_, i) => {
        const baseTime = (i / (N - 1)) * totalTimeSeconds - (totalTimeSeconds / 2);
        return baseTime + (timeOffsetMs / 1000); // Apply time offset (convert ms to seconds)
    });

    function sumHarmonics(timeMs, amplitude, phase, harmonics) {
        const t = timeMs;
        let y = amplitude * Math.sin(2 * Math.PI * frequency * t + (phase * Math.PI / 180));
        if (Array.isArray(harmonics)) {
            harmonics.forEach(h => {
                const harmAmplitude = amplitude * (h.amplitude / 100);
                y += harmAmplitude * Math.sin(2 * Math.PI * h.order * frequency * t + ((h.phase + (h.order * phase)) * Math.PI / 180));
            });
        }
        return y;
    }
    
    // Generate waveform data for all phases using loops
    const waveformData = phaseData.map(phase => ({
        label: phase.label,
        voltage: {
            data: x.map(timeMs => sumHarmonics(timeMs, phase.voltage.amplitude, phase.voltage.phase, phase.voltage.harmonics)),
            visible: phase.voltage.visible
        },
        current: {
            data: x.map(timeMs => sumHarmonics(timeMs, phase.current.amplitude, phase.current.phase, phase.current.harmonics)),
            visible: phase.current.visible
        }
    }));

    // Get colors for all phases using loops
    const rootStyles = getComputedStyle(document.documentElement);
    const colors = phaseLabels.reduce((acc, label) => {
        acc[label] = {
            voltage: rootStyles.getPropertyValue(`--${label}-voltage-color`).trim(),
            current: rootStyles.getPropertyValue(`--${label}-current-color`).trim()
        };
        return acc;
    }, {});

    const ctx = document.getElementById(canvasId)?.getContext('2d');
    if (!ctx) return;
    if (window[canvasId + '_chart']) {
        window[canvasId + '_chart'].destroy();
    }

    // Generate datasets using loops
    const datasets = [];
    
    waveformData.forEach((phase, i) => {
        // Add voltage dataset
        datasets.push({
            label: `${phase.label} Voltage`,
            data: phase.voltage.data,
            borderColor: colors[phase.label].voltage,
            borderWidth: 3,
            pointRadius: 0,
            fill: false,
            tension: 0,
            yAxisID: 'yV',
            order: (i + 1) * 2, // 2, 4, 6 for L1, L2, L3 voltage
            hidden: !phase.voltage.visible,
            shadowColor: colors[phase.label].voltage,
            shadowBlur: 10
        });
        
        // Add current dataset
        datasets.push({
            label: `${phase.label} Current`,
            data: phase.current.data,
            borderColor: colors[phase.label].current,
            borderWidth: 3,
            pointRadius: 0,
            fill: false,
            tension: 0,
            yAxisID: 'yI',
            order: (i + 1) * 2 - 1, // 1, 3, 5 for L1, L2, L3 current
            hidden: !phase.current.visible,
            shadowColor: colors[phase.label].current,
            shadowBlur: 10
        });
    });

    window[canvasId + '_chart'] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: x, // Use the actual time values as labels
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            backgroundColor: '#001100',
            plugins: {
                oscilloscopeGrid: {},
                legend: { display: false },
                tooltip: { enabled: false }
            },
            scales: {
                x: { 
                    position: 'center',
                    grid: { display: false },
                    ticks: { display: false },
                    border: { display: false },
                    min: (-totalTimeSeconds / 2) + (timeOffsetMs / 1000),
                    max: (totalTimeSeconds / 2) + (timeOffsetMs / 1000)
                },
                yV: {
                    display: false,
                    position: 'left',
                    min: (-voltageMax * 1.1) + voltageOffsetV,
                    max: (voltageMax * 1.1) + voltageOffsetV,
                    title: { display: false, text: 'Voltage (V)' },
                    grid: { display: false }
                },
                yI: {
                    display: false,
                    position: 'right',
                    min: (-currentMax * 1.1) + currentOffsetA,
                    max: (currentMax * 1.1) + currentOffsetA,
                    title: { display: false, text: 'Current (A)' },
                    grid: { display: false }
                }
            }
        }
    });
}

// Chart drag functionality for time offset control
export function initializeChartDrag() {
    const overlay = document.getElementById('chart-drag-overlay');
    const slider = document.getElementById('time-offset-slider');
    
    if (!overlay || !slider) return;
    
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let startTimeOffset = 0;
    let startVoltageOffset = 0;
    let startCurrentOffset = 0;

    const startAction = (e, mouse = false) => {
        isDragging = true;
        startX = mouse ? e.clientX : e.touches[0].clientX;
        startY = mouse ? e.clientY : e.touches[0].clientY;
        startTimeOffset = parseFloat(slider.value);
        startVoltageOffset = window.getVoltageOffset ? window.getVoltageOffset() : 0;
        startCurrentOffset = window.getCurrentOffset ? window.getCurrentOffset() : 0;
    };

    const moveAction = (e, mouse = false) => {
        if (!isDragging) return;

        const deltaX = mouse ? e.clientX - startX : e.touches[0].clientX - startX;
        const deltaY = mouse ? e.clientY - startY : e.touches[0].clientY - startY;
        const overlayRect = overlay.getBoundingClientRect();
        
        // Horizontal dragging (time offset)
        const timeOffsetDelta = (deltaX / overlayRect.width) * 100; // -50 to +50 range
        let newSliderValue = Math.max(-50, Math.min(50, startTimeOffset + timeOffsetDelta));
        slider.value = newSliderValue;
        
        if (window.setTimeOffset) {
            window.setTimeOffset(-newSliderValue); // Inverted
        }
        
        // Vertical dragging with modifier keys
        if (e.shiftKey || e.ctrlKey) {
            // Use shift/ctrl to distinguish voltage vs current adjustment
            const verticalSensitivity = 0.5; // Adjust sensitivity as needed
            const verticalDelta = -(deltaY / overlayRect.height) * verticalSensitivity;
            
            if (e.shiftKey && window.setVoltageOffset) {
                // Shift key for voltage offset
                const newVoltageOffset = startVoltageOffset + (verticalDelta * 100); // Scale for voltage
                window.setVoltageOffset(newVoltageOffset);
            } else if (e.ctrlKey && window.setCurrentOffset) {
                // Ctrl key for current offset  
                const newCurrentOffset = startCurrentOffset + (verticalDelta * 10); // Scale for current
                window.setCurrentOffset(newCurrentOffset);
            }
        }
    }

    const resetAction = () => {
        isDragging = false;
    };


    overlay.addEventListener('touchstart', startAction, { passive: true });
    overlay.addEventListener('mousedown', (e) => startAction(e, true));
    document.addEventListener('touchmove', moveAction);
    document.addEventListener('mousemove', (e) => moveAction(e, true));
    document.addEventListener('touchend', resetAction);
    document.addEventListener('mouseup', resetAction);
}
