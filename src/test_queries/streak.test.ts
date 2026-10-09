import { describe, it, expect } from "vitest";
import { countStreak } from "../streak.js";

const weekdays = [1, 2, 3, 4, 5];

describe("countStreak", () => {
    it("counts the scheduled days in a row it was done", () => {
        const streak = countStreak({
            today: "2026-10-08",
            started: "2026-09-01",
            weekdays,
            doneOn: ["2026-10-06", "2026-10-07", "2026-10-08"],
        });

        expect(streak).toBe(3);
    });

    it("carries a weekday streak over the weekend", () => {
        const streak = countStreak({
            today: "2026-10-12",
            started: "2026-09-01",
            weekdays,
            doneOn: ["2026-10-08", "2026-10-09", "2026-10-12"],
        });

        expect(streak).toBe(3);
    });

    it("does not break the streak for today until today is over", () => {
        const streak = countStreak({
            today: "2026-10-08",
            started: "2026-09-01",
            weekdays,
            doneOn: ["2026-10-06", "2026-10-07"],
        });

        expect(streak).toBe(2);
    });

    it("stops counting at the day the routine was created", () => {
        const streak = countStreak({
            today: "2026-10-08",
            started: "2026-10-07",
            weekdays,
            doneOn: ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08"],
        });

        expect(streak).toBe(2);
    });

    it("keeps a completion on an unscheduled day out of the count", () => {
        const streak = countStreak({
            today: "2026-10-12",
            started: "2026-09-01",
            weekdays,
            doneOn: ["2026-10-09", "2026-10-10", "2026-10-11"],
        });

        expect(streak).toBe(1);
    });
});