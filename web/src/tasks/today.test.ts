import { describe, expect, it } from "vitest";
import { todayIn } from "./today";

describe("today in a timezone", () => {
    it("gives the calendar day there, as text", () => {
        // 23:30 UTC on 24 October: still the 24th in Vancouver, already the 25th in Zagreb
        const moment = new Date("2026-10-24T23:30:00Z");

        expect(todayIn("America/Vancouver", moment)).toBe("2026-10-24");
        expect(todayIn("Europe/Zagreb", moment)).toBe("2026-10-25");
        expect(todayIn("Etc/GMT+8", moment)).toBe("2026-10-24");
    });
});
