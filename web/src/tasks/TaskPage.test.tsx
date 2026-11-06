import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { routes } from "../routes";
import { standInApi } from "../testing/standInApi";

const members = [
    { membership_id: "1", user_id: "1", email: "lead@example.com", role: "lead", joined_at: "2026-11-01T09:00:00.000Z" },
    { membership_id: "2", user_id: "2", email: "ana@example.com", role: "associate", joined_at: "2026-11-02T09:00:00.000Z" },
];
const tasks = [
    { id: "3", title: "Dig the beds", status: "in_progress", priority: "high", due_date: "2026-11-20", notes: "Mind the roots", assignee_membership_id: "2" },
    { id: "1", title: "Buy seeds", status: "not_started", priority: null, due_date: null, notes: null, assignee_membership_id: null },
];

// Garden, for its Lead, opened at the address given
async function showGarden(path: string) {
    const fetch = standInApi({
        "GET /account": [200, { user: { id: "1", email: "lead@example.com" } }],
        "GET /projects": [200, { projects: [{ id: "7", name: "Garden", role: "lead" }] }],
        "GET /projects/7/tasks": [200, { tasks }],
        "GET /projects/7/members": [200, { members }],
    });
    const router = createMemoryRouter(routes, { initialEntries: [path] });
    render(<RouterProvider router={router} />);
    await screen.findByRole("heading", { name: "Garden" });
    return { router, fetch };
}

// The task page's fields, as words: { Status: "In progress", … }
function fields() {
    const page = screen.getByRole("region", { name: /./ });
    const terms = within(page).getAllByRole("term").map((term) => term.textContent);
    const definitions = within(page).getAllByRole("definition").map((definition) => definition.textContent);
    return Object.fromEntries(terms.map((term, i) => [term, definitions[i]]));
}

describe("a task's page", () => {
    it("opens from its title in the list, under the list, asking the server nothing more", async () => {
        const { router, fetch } = await showGarden("/projects/7");
        const asked = fetch.mock.calls.length;

        await userEvent.click(screen.getByRole("link", { name: "Dig the beds" }));

        expect(await screen.findByRole("region", { name: "Dig the beds" })).toBeDefined();
        expect(router.state.location.pathname).toBe("/projects/7/tasks/3");
        expect(screen.getByRole("table")).toBeDefined();
        expect(fetch.mock.calls.length).toBe(asked);
    });

    it("shows the task's fields in words, and its notes", async () => {
        await showGarden("/projects/7/tasks/3");

        await screen.findByRole("region", { name: "Dig the beds" });
        expect(fields()).toEqual({
            Status: "In progress",
            Priority: "High",
            Due: "2026-11-20",
            "Assigned to": "ana@example.com",
            Notes: "Mind the roots",
        });
    });

    it("says the empty ones in words too", async () => {
        await showGarden("/projects/7/tasks/1");

        await screen.findByRole("region", { name: "Buy seeds" });
        expect(fields()).toEqual({
            Status: "Not started",
            Priority: "Not set",
            Due: "TBD",
            "Assigned to": "Nobody",
            Notes: "No notes",
        });
    });

    it("closes back to the project", async () => {
        const { router } = await showGarden("/projects/7/tasks/3");

        await userEvent.click(await screen.findByRole("link", { name: "Close" }));

        expect(router.state.location.pathname).toBe("/projects/7");
        expect(screen.queryByRole("region", { name: "Dig the beds" })).toBeNull();
    });

    it("says there's no task here for an id not in the list, under the project", async () => {
        await showGarden("/projects/7/tasks/99");

        expect(await screen.findByText("There's no task here.")).toBeDefined();
        expect(screen.getByRole("table")).toBeDefined();
    });
});
