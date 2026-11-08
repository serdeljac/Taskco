import { onTestFinished, vi } from "vitest";

// jsdom draws nothing, so every row measures 0 by 0 and a keyboard drag lands in the wrong place.
// For one test, each element in a row measures as the row: 40px high, stacked in its table's order
export function giveRowsSizes() {
    const sizes = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
        const row = this.closest("tr");
        const top = row ? [...row.parentElement!.children].indexOf(row) * 40 : 0;
        return { x: 0, y: top, top, left: 0, right: 600, bottom: top + 40, width: 600, height: 40, toJSON: () => ({}) };
    });
    onTestFinished(() => sizes.mockRestore());
}
