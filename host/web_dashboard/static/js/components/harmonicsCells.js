
export function harmonicsCells(harmonics, waveType) {
    if (waveType !== 'voltage' && waveType !== 'current') {
        return '<tr><td class="text-center small py-0" colspan="3">No harmonics data available</td></tr>';
    }
    const subChar = waveType === 'voltage' ? 'v' : 'i';
    let cells = [];
    const blankCell = `<td style="white-space:pre" class="text-center small py-0">&mdash;</td>`;
    if (Array.isArray(harmonics) && harmonics.length > 0) {
        const sorted = harmonics.slice().sort((a, b) => a.order - b.order);
        for (let i = 0; i < 4; i++) {
            if (sorted[i]) {
                cells.push(
                    `<td style="white-space:pre" class="text-start small py-0">H<sub>${subChar}</sub> ${sorted[i].order.toFixed(0).padStart(3, ' ')}</td>
                     <td style="white-space:pre" class="text-end small py-0">${sorted[i].amplitude.toFixed(0).padStart(3, ' ')}%</td>
                     <td style="white-space:pre" class="text-end small py-0">${sorted[i].phase.toFixed(0).padStart(4, ' ')}&deg;</td>`);
            } else {
                cells.push(blankCell + blankCell + blankCell);
            }
        }
    } else {
        for (let i = 0; i < 4; i++) {
            cells.push(blankCell + blankCell + blankCell);
        }
    }
    let rows = [];
    for (let i = 0; i < 4; i++) {
        rows.push(`<tr>${cells[i]}</tr>`);
    }
    return rows.join('');
}
