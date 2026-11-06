import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { routes } from "../../routes";
import { standInApi, type Answer } from "../../testing/standInApi";

const unreachable = "Taskco can't be reached. Is the server running?";
const members = [
    { membership_id: "1", user_id: "1", email: "lead@example.com", role: "lead", joined_at: "2026-11-01T09:00:00.000Z" },
    { membership_id: "2", user_id: "2", email: "ana@example.com", role: "associate", joined_at: "2026-11-02T09:00:00.000Z" },
];

// Garden, for its Lead, with task 3 open. Every change to task 3 is refused: nothing answers
async function showRefusingTask() {
    const tasks = [
        { id: "3", title: "Dig the beds", status: "in_progress", priority: "high", due_date: "2026-11-20", notes: null, assignee_membership_id: "1" },
        { id: "1", title: "Buy seeds", status: "not_started", priority: null, due_date: null, notes: null, assignee_membership_id: null },
    ];
    const refused: Answer = [502];
    standInApi({
        "GET /account": [200, { user: { id: "1", email: "lead@example.com" } }],
        "GET /projects": [200, { projects: [{ id: "7", name: "Garden", role: "lead" }] }],
        "GET /projects/7/tasks": [200, { tasks }],
        "GET /projects/7/members": [200, { members }],
        "GET /tasks/3/subtasks": [200, { subtasks: [] }],
        "GET /tasks/1/subtasks": [200, { subtasks: [] }],
        // Answered, so that it is the saving of a due date that is refused, not the question before it
        "GET /tasks/3/due-date-clears?dueDate=2026-12-01": [200, { clears: 0 }],
        "PUT /tasks/3/status": refused,
        "PUT /tasks/3/priority": refused,
        "PUT /tasks/3/assignee": refused,
        "PUT /tasks/3/due-date": refused,
    });
    render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ["/projects/7/tasks/3"] })} />);
    await screen.findByRole("region", { name: "Dig the beds" });
}

describe("a refused change on a task's page", () => {
    it.each([
        ["Status", "completed", "in_progress"],
        ["Priority", "low", "high"],
        ["Assigned to", "2", "1"],
    ])("puts the %s back to what the server has", async (field, chosen, kept) => {
        await showRefusingTask();

        await userEvent.selectOptions(screen.getByLabelText(field), chosen);

        expect(await screen.findByText(unreachable)).toBeDefined();
        expect(screen.getByLabelText(field)).toHaveProperty("value", kept);
    });

    it("keeps a typed due date, so it can be sent again", async () => {
        await showRefusingTask();

        await userEvent.clear(screen.getByLabelText("Due date"));
        await userEvent.type(screen.getByLabelText("Due date"), "2026-12-01");
        await userEvent.click(screen.getByRole("button", { name: "Save date" }));

        expect(await screen.findByText(unreachable)).toBeDefined();
        expect(screen.getByLabelText("Due date")).toHaveProperty("value", "2026-12-01");
    });

    it("does not follow to another task", async () => {
        await showRefusingTask();
        await userEvent.selectOptions(screen.getByLabelText("Status"), "completed");
        await screen.findByText(unreachable);

        await userEvent.click(screen.getByRole("link", { name: "Buy seeds" }));

        await screen.findByRole("region", { name: "Buy seeds" });
        expect(screen.queryByText(unreachable)).toBeNull();
    });
});
