// Chart rendering for NHP Synth Dashboard
// used to generate phasor diagrams
// Exported as ES module

/**
 * Renders a vector chart in the complex plane for the given vectors.
 * @param {Array<{amplitude: number, phase: number, label: string}>} vectors 
 * @param {String} canvasId 
 * @returns 
 */

export function vectorChart(vectors, canvasId) {
    if (!Array.isArray(vectors) || vectors.length === 0) return;
    if (vectors.some(v => 
        v.amplitude === undefined ||
        v.phaseAngle === undefined ||
        v.phaseLabel === undefined) ||
        v.waveType === undefined
    ) return;

    const dataPoints = vectors.map(v => ({
        x: v.amplitude * Math.cos(v.phaseAngle * Math.PI / 180),
        y: v.amplitude * Math.sin(v.phaseAngle * Math.PI / 180),
        label: v.label
    }));

    const phasorArrows = {
        id: 'phasorArrows',
        beforeDatasetsDraw: (chart) => {
            const { ctx, scales: { x, y } } = chart;
            ctx.save();
            ctx.lineWidth = 4;
            dataPoints.forEach((point, i) => {
                const x0 = x.getPixelForValue(0);
                const y0 = y.getPixelForValue(0);
                const x1 = x.getPixelForValue(point.x);
                const y1 = y.getPixelForValue(point.y);
                ctx.beginPath();
                ctx.moveTo(x0, y0);
                ctx.lineTo(x1, y1);
                ctx.strokeStyle = getComputedStyle(document.documentElement)
                    .getPropertyValue(`--${vectors[i].phaseLabel}-${vectors[i].waveType}`).trim();
                ctx.stroke();
                // Arrowhead
                const angle = Math.atan2(point.y, point.x);
                const headlen = 10;
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x1 - headlen * Math.cos(angle - Math.PI / 6), 
                           y1 - headlen * Math.sin(angle - Math.PI / 6));
                ctx.lineTo(x1 - headlen * Math.cos(angle + Math.PI / 6), 
                           y1 - headlen * Math.sin(angle + Math.PI / 6));
                ctx.lineTo(x1, y1);
                ctx.fillStyle = ctx.strokeStyle;
                ctx.fill();
            });
            ctx.restore();
        }
    }

    Chart.register(phasorArrows);

    const data = {
        datasets: [{
            label: 'Phasors',
            data: dataPoints,
            backgroundColor: dataPoints.map(point => {
                const color = getComputedStyle(document.documentElement)
                    .getPropertyValue(`--${point.label}-${vectors[0].waveType}`).trim();
                return color ? color : 'rgba(0, 0, 0, 0.1)';
            }),
            pointRadius: 0,
            pointHoverRadius: 0,
            showLine: false,
        }]
    };

    const config = {
        type: 'scatter',
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: false
                },
            }
        }
    };

    const ctx = document.getElementById(canvasId)?.getContext('2d');
    if (!ctx) return;
    if (window[canvasId + '_chart']) {
        window[canvasId + '_chart'].destroy();
    }
    window[canvasId + '_chart'] = new Chart(ctx, config);
    window[canvasId + '_chart'].update();
    return window[canvasId + '_chart']; 
}