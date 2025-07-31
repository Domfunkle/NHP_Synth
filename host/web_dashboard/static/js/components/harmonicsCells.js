
export function harmonicsCells(harmonics) {
    let cells = [];
    if (Array.isArray(harmonics) && harmonics.length > 0) {
        const sorted = harmonics.slice().sort((a, b) => a.order - b.order);
        for (let i = 0; i < 4; i++) {
            if (sorted[i]) {
                cells.push(`<td class="text-start small py-0">H${sorted[i].order}</td><td class="text-end small py-0">${sorted[i].amplitude}%</td><td class="text-end small py-0">${sorted[i].phase}&deg;</td>`);
            } else {
                cells.push('<td class="text-start small py-0">&mdash;</td><td class="text-end small py-0">&mdash;</td><td class="text-end small py-0">&mdash;</td>');
            }
        }
    } else {
        for (let i = 0; i < 4; i++) {
            cells.push('<td class="text-start small py-0">&mdash;</td><td class="text-end small py-0">&mdash;</td><td class="text-end small py-0">&mdash;</td>');
        }
    }
    let rows = [];
    for (let i = 0; i < 4; i++) {
        rows.push(`<tr>${cells[i]}</tr>`);
    }
    return rows.join('');
}
