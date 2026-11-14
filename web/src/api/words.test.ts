import { describe, expect, it } from "vitest";
import { wordsFor } from "./words";

describe("wordsFor", () => {
    it("gives the frontend's own words for a code it knows", () => {
        expect(wordsFor("wrong-email-or-password")).toBe("The email or password is wrong.");
        expect(wordsFor("unreachable")).toBe("Taskco can't be reached. Is the server running?");
    });

    it("says a subtask's three refusals in its own words", () => {
        expect(wordsFor("subtask-due-after-task")).toBe("A subtask can't be due after its task.");
        expect(wordsFor("subtask-due-before-today")).toBe("A subtask can't be due before today.");
        expect(wordsFor("subtask-limit")).toBe("A task can have at most 50 subtasks.");
    });

    it("says a move that lost its place in the list in its own words", () => {
        expect(wordsFor("neighbour-not-found")).toBe("The list changed while you were moving it. Try again.");
    });

    it("gives one general sentence for a code it does not know", () => {
        expect(wordsFor("server-error")).toBe("Something went wrong. Try again.");
        expect(wordsFor("not-found")).toBe("Something went wrong. Try again.");
        // A name every plain object has, which a lookup in one would find
        expect(wordsFor("toString")).toBe("Something went wrong. Try again.");
    });
});
