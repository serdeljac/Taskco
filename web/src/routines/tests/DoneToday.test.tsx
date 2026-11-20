import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { routes } from "../../routes";
import { standInApi, type Answer } from "../../testing/standInApi";

// Read is due today and not done; Run is not due today. Done and Undo change what the API says
// about Read, and its streak, as the API does, unless a test gives another answer
async function showRoutines(answers: Record<string, Answer> = {}) {
    let readDone = false;
    const fetch = standInApi({
        "GET /account": [200, { user: { id: "1", email: "lead@example.com", timezone: "Europe/Zagreb" } }],
        "GET /routines": () => [
            200,
            {
                routines: [
                    { id: "2", user_id: "1", name: "Read", weekdays: [1, 2, 3, 4, 5], due_today: true, done_today: readDone },
                    { id: "3", user_id: "1", name: "Run", weekdays: [6], due_today: false, done_today: false },
                ],
            },
        ],
        "GET /routines/2/streak": () => [200, { streak: readDone ? 4 : 3 }],
        "GET /routines/3/streak": [200, { streak: 0 }],
        "PUT /routines/2/completions/today": () => {
            readDone = true;
            return [200, { doneOn: "2026-11-20" }];
        },
        "DELETE /routines/2/completions/today": () => {
            readDone = false;
            return [204];
        },
        ...answers,
    });
    const router = createMemoryRouter(routes, { initialEntries: ["/routines"] });
    render(<RouterProvider router={router} />);
    await screen.findByRole("heading", { name: "Routines" });
    return { fetch };
}

// The line for one routine, found by its name
function line(name: string) {
    const item = within(screen.getByRole("list"))
        .getAllByRole("listitem")
        .find((item) => item.querySelector("strong")?.textContent === name);
    if (!item) {
        throw new Error(`No line for ${name}`);
    }
    return within(item);
}

describe("doing a routine today", () => {
    it("marks it done today, and the streak counts it", async () => {
        const { fetch } = await showRoutines();

        await userEvent.click(screen.getByRole("button", { name: "Mark Read done today" }));

        expect(await line("Read").findByText("Done today")).toBeDefined();
        expect(line("Read").getByText("4 days in a row")).toBeDefined();
        expect(fetch.mock.calls.some(([url, init]) => url === "/api/routines/2/completions/today" && init?.method === "PUT")).toBe(true);
    });

    it("undoes it, and the streak goes back", async () => {
        await showRoutines();

        await userEvent.click(screen.getByRole("button", { name: "Mark Read done today" }));
        await userEvent.click(await screen.findByRole("button", { name: "Undo Read for today" }));

        expect(await line("Read").findByText("Due today")).toBeDefined();
        expect(line("Read").getByText("3 days in a row")).toBeDefined();
        expect(screen.getByRole("button", { name: "Mark Read done today" })).toBeDefined();
    });

    it("offers nothing to press on a day the routine is not for", async () => {
        await showRoutines();

        expect(line("Run").queryByRole("button")).toBeNull();
    });

    it("says when there is nothing today to undo", async () => {
        await showRoutines({
            "GET /routines": [
                200,
                { routines: [{ id: "2", user_id: "1", name: "Read", weekdays: [1, 2, 3, 4, 5], due_today: true, done_today: true }] },
            ],
            "DELETE /routines/2/completions/today": [409, { error: "undoCompletion: not completed today", code: "not-completed-today" }],
        });

        await userEvent.click(screen.getByRole("button", { name: "Undo Read for today" }));

        expect(await screen.findByText("It wasn't marked done today.")).toBeDefined();
    });
});