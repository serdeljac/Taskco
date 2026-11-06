import { describe, expect, it } from "vitest";
import type { Member } from "../api/types";
import { assigneeWords, dueDateWords, priorityWords, roleWords, statusWords } from "./words";

const members: Member[] = [
    { membership_id: "1", user_id: "1", email: "lead@example.com", role: "lead", joined_at: "2026-11-01T09:00:00.000Z" },
    { membership_id: "2", user_id: "2", email: "associate@example.com", role: "associate", joined_at: "2026-11-02T09:00:00.000Z" },
];

describe("a task's words", () => {
    it("says each status in Taskco's words", () => {
        expect(statusWords("not_started")).toBe("Not started");
        expect(statusWords("in_progress")).toBe("In progress");
        expect(statusWords("on_hold")).toBe("On hold");
        expect(statusWords("completed")).toBe("Completed");
    });

    it("says each priority, and an empty one as Not set", () => {
        expect(priorityWords("low")).toBe("Low");
        expect(priorityWords("med")).toBe("Med");
        expect(priorityWords("high")).toBe("High");
        expect(priorityWords(null)).toBe("Not set");
    });

    it("shows a due date as the day it is, and an empty one as TBD", () => {
        expect(dueDateWords("2026-11-20")).toBe("2026-11-20");
        expect(dueDateWords(null)).toBe("TBD");
    });

    it("says each role in Taskco's words", () => {
        expect(roleWords("lead")).toBe("Lead");
        expect(roleWords("associate")).toBe("Associate");
    });

    it("names the assignee by email, and nobody as Nobody", () => {
        expect(assigneeWords("2", members)).toBe("associate@example.com");
        expect(assigneeWords(null, members)).toBe("Nobody");
    });
});
