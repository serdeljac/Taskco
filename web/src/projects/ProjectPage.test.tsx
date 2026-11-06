import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { routes } from "../routes";
import { standInApi, type Answer } from "../testing/standInApi";

const lead = { id: "1", email: "lead@example.com" };
const members = [
    { membership_id: "1", user_id: "1", email: "lead@example.com", role: "lead", joined_at: "2026-11-01T09:00:00.000Z" },
    { membership_id: "2", user_id: "2", email: "ana@example.com", role: "associate", joined_at: "2026-11-02T09:00:00.000Z" },
];
const digTheBeds = {
    id: "3",
    title: "Dig the beds",
    status: "in_progress",
    priority: "high",
    due_date: "2026-11-20",
    assignee_membership_id: "2",
};
const buySeeds = {
    id: "1",
    title: "Buy seeds",
    status: "not_started",
    priority: null,
    due_date: null,
    assignee_membership_id: null,
};

// /projects/7, Garden, for its Lead, with these tasks
function showGarden(tasks: unknown[]) {
    const answers: Record<string, Answer> = {
        "GET /account": [200, { user: lead }],
        "GET /projects": [200, { projects: [{ id: "7", name: "Garden", role: "lead" }] }],
        "GET /projects/7/tasks": [200, { tasks }],
        "GET /projects/7/members": [200, { members }],
    };
    standInApi(answers);
    const router = createMemoryRouter(routes, { initialEntries: ["/projects/7"] });
    render(<RouterProvider router={router} />);
    return router;
}

// The words in each row of the task table, under its header row
function taskRows() {
    return screen
        .getAllByRole("row")
        .slice(1)
        .map((row) => within(row).getAllByRole("cell").map((cell) => cell.textContent));
}

describe("/projects/:projectId", () => {
    it("shows the project's name, and its tasks' titles in the order sent", async () => {
        showGarden([digTheBeds, buySeeds]);

        expect(await screen.findByRole("heading", { name: "Garden" })).toBeDefined();
        expect(taskRows().map((row) => row[0])).toEqual(["Dig the beds", "Buy seeds"]);
    });

    it("shows each task's status, priority, due date and assignee in words, empty ones too", async () => {
        showGarden([digTheBeds, buySeeds]);

        await screen.findByRole("heading", { name: "Garden" });
        expect(taskRows()).toEqual([
            ["Dig the beds", "In progress", "High", "2026-11-20", "ana@example.com"],
            ["Buy seeds", "Not started", "Not set", "TBD", "Nobody"],
        ]);
    });

    it("lists the members, the Lead first, as sent", async () => {
        showGarden([]);

        const list = await screen.findByRole("list", { name: "Members" });
        expect(within(list).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
            "lead@example.com, Lead",
            "ana@example.com, Associate",
        ]);
    });

    it("says so when the project has no tasks, and links back to every project", async () => {
        showGarden([]);

        expect(await screen.findByText("No tasks yet")).toBeDefined();
        expect(screen.queryByRole("table")).toBeNull();
        expect(screen.getByRole("link", { name: "All projects" }).getAttribute("href")).toBe("/");
    });

    it("says there's no page for a project the person isn't in", async () => {
        standInApi({
            "GET /account": [200, { user: lead }],
            "GET /projects": [200, { projects: [] }],
        });
        const router = createMemoryRouter(routes, { initialEntries: ["/projects/99"] });
        render(<RouterProvider router={router} />);

        expect(await screen.findByText("There's no page here.")).toBeDefined();
    });
});
