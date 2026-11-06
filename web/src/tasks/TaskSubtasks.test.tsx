import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { routes } from "../routes";
import { standInApi, type Answer } from "../testing/standInApi";

const members = [
    { membership_id: "1", user_id: "1", email: "lead@example.com", role: "lead", joined_at: "2026-11-01T09:00:00.000Z" },
    { membership_id: "2", user_id: "2", email: "ana@example.com", role: "associate", joined_at: "2026-11-02T09:00:00.000Z" },
];
const task = { id: "3", title: "Dig the beds", status: "in_progress", priority: null, due_date: "2099-11-30", notes: null, assignee_membership_id: "1" };

// Garden's task 3, opened at the address given, with these subtasks
async function showTask(path: string, subtasks: Answer) {
    const fetch = standInApi({
        "GET /account": [200, { user: { id: "1", email: "lead@example.com", timezone: "Europe/Zagreb" } }],
        "GET /projects": [200, { projects: [{ id: "7", name: "Garden", role: "lead" }] }],
        "GET /projects/7/tasks": [200, { tasks: [task] }],
        "GET /projects/7/members": [200, { members }],
        "GET /tasks/3/subtasks": subtasks,
    });
    const router = createMemoryRouter(routes, { initialEntries: [path] });
    render(<RouterProvider router={router} />);
    await screen.findByRole("heading", { name: "Garden" });
    return { router, fetch };
}

// The words in each row of the subtask table, under its header row
function subtaskRows() {
    const table = screen.getByRole("table", { name: "Subtasks" });
    return within(table)
        .getAllByRole("row")
        .slice(1)
        .map((row) => within(row).getAllByRole("cell").map((cell) => cell.textContent));
}

describe("a task's subtasks", () => {
    it("are asked for when the task opens, and shown in the order sent, each field in words", async () => {
        const { fetch } = await showTask("/projects/7", [
            200,
            {
                subtasks: [
                    { id: "9", task_id: "3", title: "Turn the soil", status: "completed", priority: "high", due_date: "2099-11-20", notes: null, assignee_membership_id: "2" },
                    { id: "8", task_id: "3", title: "Edge the beds", status: "not_started", priority: null, due_date: null, notes: null, assignee_membership_id: null },
                ],
            },
        ]);

        await userEvent.click(screen.getByRole("link", { name: "Dig the beds" }));

        await screen.findByRole("table", { name: "Subtasks" });
        expect(subtaskRows()).toEqual([
            ["Turn the soil", "Completed", "High", "2099-11-20", "ana@example.com"],
            ["Edge the beds", "Not started", "Not set", "TBD", "Nobody"],
        ]);
        expect(fetch).toHaveBeenCalledWith("/api/tasks/3/subtasks", { method: "GET" });
    });

    it("link each title to the subtask's own page", async () => {
        await showTask("/projects/7/tasks/3", [
            200,
            { subtasks: [{ id: "9", task_id: "3", title: "Turn the soil", status: "not_started", priority: null, due_date: null, notes: null, assignee_membership_id: null }] },
        ]);

        const link = await screen.findByRole("link", { name: "Turn the soil" });
        expect(link.getAttribute("href")).toBe("/projects/7/tasks/3/subtasks/9");
    });

    it("say so when there are none", async () => {
        await showTask("/projects/7/tasks/3", [200, { subtasks: [] }]);

        expect(await screen.findByText("No subtasks yet")).toBeDefined();
        expect(screen.queryByRole("table", { name: "Subtasks" })).toBeNull();
    });

    it("leave a task the server cannot find to say there's no task here", async () => {
        await showTask("/projects/7/tasks/3", [404, { error: "Not found", code: "not-found" }]);

        expect(await screen.findByRole("region", { name: "Dig the beds" })).toBeDefined();
        expect(await screen.findByText("No subtasks yet")).toBeDefined();
    });
});
