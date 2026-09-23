import { useLayoutEffect, type RefObject } from 'react';

const SCROLLBAR_WIDTH = 14;
const PROCESS_MAX_WIDTH = 320;

export function useAdaptiveTableColumns(
    tableRef: RefObject<HTMLTableElement | null>,
    rows: readonly unknown[],
    columnCount: number,
    processColumn: number,
    layoutKey: unknown,
) {
    useLayoutEffect(() => {
        const table = tableRef.current;
        const wrapper = table?.parentElement;
        if (!table || !wrapper) return;

        const measure = () => {
            const headerCells = Array.from(table.tHead?.rows[0]?.cells ?? []);
            const probe = document.createElement('div');
            probe.style.cssText = 'position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none;z-index:-1';
            const cells: Array<{ copy: HTMLTableCellElement; index: number }> = [];
            const addCell = (cell: HTMLTableCellElement, index: number) => {
                const copy = cell.cloneNode(true) as HTMLTableCellElement;
                const computed = getComputedStyle(cell);
                copy.style.display = 'block';
                copy.style.width = 'max-content';
                copy.style.maxWidth = 'none';
                copy.style.font = computed.font;
                copy.style.letterSpacing = computed.letterSpacing;
                copy.style.whiteSpace = index === processColumn ? 'normal' : 'nowrap';
                probe.append(copy);
                cells.push({ copy, index });
            };

            headerCells.forEach(addCell);
            for (const row of Array.from(table.tBodies[0]?.rows ?? [])) {
                if (row.cells.length !== columnCount) continue;
                Array.from(row.cells).forEach(addCell);
            }
            document.body.append(probe);

            const widths = Array<number>(columnCount).fill(0);
            for (const { copy, index } of cells) {
                const naturalWidth = Math.ceil(copy.getBoundingClientRect().width);
                widths[index] = Math.max(widths[index], naturalWidth);
            }
            probe.remove();

            widths[processColumn] = Math.min(widths[processColumn], PROCESS_MAX_WIDTH);
            const available = Math.max(0, wrapper.clientWidth - SCROLLBAR_WIDTH);
            const naturalWidth = widths.reduce((sum, width) => sum + width, 0);
            widths[columnCount - 1] += Math.max(0, available - naturalWidth);
            widths.forEach((width, index) => {
                table.style.setProperty(`--table-column-${index + 1}`, `${width}px`);
            });
            table.style.width = `${widths.reduce((sum, width) => sum + width, SCROLLBAR_WIDTH)}px`;
        };

        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(wrapper);
        return () => observer.disconnect();
    }, [tableRef, rows, columnCount, processColumn, layoutKey]);
}
