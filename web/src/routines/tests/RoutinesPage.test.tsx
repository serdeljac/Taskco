import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { routes } from "../../routes";
import { standInApi, type Answer } from "../../testing/standInApi";

const stretch = { id: "1", user_id: "1", name: "Stretch", weekdays: [1, 2, 3, 4, 5, 6, 7], due_today: true, done_today: true };
const read = { id: "2", user_id: "1", name: "Read", weekdays: [1, 2, 3, 4, 5], due_today: true, done_today: false };
const run = { id: "3", user_id: "1", name: "Run", weekdays: [1, 3, 5], due_today: false, done_today: false };

// /routines, or another page, for someone with these routines and these streaks
function show(path: string, routines: unknown[], streaks: Record<string, Answer> = {}) {
    const fetch = standInApi({
        "GET /account": [200, { user: { id: "1", email: "lead@example.com", timezone: "Europe/Zagreb" } }],
        "GET /projects": [200, { projects: [] }],
        "GET /routines": [200, { routines }],
        ...streaks,
    });
    const router = createMemoryRouter(routes, { initialEntries: [path] });
    render(<RouterProvider router={router} />);
    return { fetch, router };
}

// The words in each routine's line
function routineLines() {
    return within(screen.getByRole("list"))
        .getAllByRole("listitem")
        .map((item) => Array.from(item.children).map((part) => part.textContent));
}

describe("/routines", () => {
    it("lists each routine with its days, today, and its streak, in the order sent", async () => {
        show("/routines", [stretch, read, run], {
            "GET /routines/1/streak": [200, { streak: 12 }],
            "GET /routines/2/streak": [200, { streak: 1 }],
            "GET /routines/3/streak": [200, { streak: 0 }],
        });

        await screen.findByRole("heading", { name: "Routines" });
        expect(routineLines()).toEqual([
            ["Stretch", "Every day", "Done today", "12 days in a row"],
            ["Read", "Weekdays", "Due today", "1 day in a row"],
            ["Run", "Mon, Wed, Fri", "Not due today", "No streak yet"],
        ]);
    });

    it("says so when there are none, and asks for no streaks", async () => {
        const { fetch } = show("/routines", []);

        expect(await screen.findByText("No routines yet")).toBeDefined();
        expect(fetch.mock.calls.some(([url]) => String(url).includes("/streak"))).toBe(false);
    });

    it("is one click away from every page, and the projects are one click back", async () => {
        const { router } = show("/", [], {});

        await userEvent.click(await screen.findByRole("link", { name: "Routines" }));
        expect(await screen.findByRole("heading", { name: "Routines" })).toBeDefined();

        await userEvent.click(screen.getByRole("link", { name: "Projects" }));
        expect(await screen.findByRole("heading", { name: "Projects" })).toBeDefined();
        expect(router.state.location.pathname).toBe("/");
    });
});