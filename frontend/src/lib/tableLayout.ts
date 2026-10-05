// Bound expensive DOM cloning/layout reads while retaining long text outliers.
export function sampleTableCells<T extends { readonly textContent: string | null }>(
    rows: readonly (readonly T[])[],
    columnCount: number,
    maxSampleRows = 16,
): T[] {
    const sampledCells = new Set<T>();
    const sampleCount = Math.min(rows.length, maxSampleRows);
    for (let i = 0; i < sampleCount; i++) {
        const index = sampleCount === 1 ? 0 : Math.round(i * (rows.length - 1) / (sampleCount - 1));
        rows[index].forEach(cell => sampledCells.add(cell));
    }
    const longestCells: Array<T | undefined> = Array(columnCount);
    for (const row of rows) {
        row.forEach((cell, index) => {
            if ((cell.textContent?.length ?? 0) > (longestCells[index]?.textContent?.length ?? -1)) {
                longestCells[index] = cell;
            }
        });
    }
    longestCells.forEach(cell => { if (cell) sampledCells.add(cell); });
    return [...sampledCells];
}
