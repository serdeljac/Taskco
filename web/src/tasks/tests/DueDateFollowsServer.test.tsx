import { describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { routes } from "../../routes";
import { standInApi, type Answer } from "../../testing/standInApi";

// Garden's task 3, "Dig the beds", due 2099-11-30, with "Turn the soil" under it, due 2099-11-25,
// opened at the address given for its Lead. Moving the task's date clears the subtask dates after
// it, as the API does; 2099-11-18 clears one, 2099-11-29 none
async function showGarden(path: string) {
    const task = { id: "3", title: "Dig the beds", status: "in_progress", priority: null, due_date: "2099-11-30", notes: null, assignee_membership_id: null };
    const subtasks: { id: string; task_id: string; title: string; status: string; priority: null; due_date: string | null; notes: null; assignee_membership_id: null }[] = [
        { id: "9", task_id: "3", title: "Turn the soil", status: "not_started", priority: null, due_date: "2099-11-25", notes: null, assignee_membership_id: null },
    ];
    const fetch = standInApi({
        "GET /account": [200, { user: { id: "1", email: "lead@example.com", timezone: "Europe/Zagreb" } }],
        "GET /projects": [200, { projects: [{ id: "7", name: "Garden", role: "lead" }] }],
        "GET /projects/7/tasks": () => [200, { tasks: [task] }],
        "GET /projects/7/members": [200, { members: [] }],
        "GET /tasks/3/subtasks": () => [200, { subtasks }],
        "GET /tasks/3/due-date-clears?dueDate=2099-11-18": [200, { clears: 1 }],
        "GET /tasks/3/due-date-clears?dueDate=2099-11-29": [200, { clears: 0 }],
        "PUT /tasks/3/due-date": (): Answer => {
            const dueDate = JSON.parse(String(fetch.mock.calls.at(-1)?.[1]?.body)).dueDate;
            task.due_date = dueDate;
            const cleared = subtasks.filter((subtask) => subtask.due_date !== null && subtask.due_date > dueDate);
            cleared.forEach((subtask) => (subtask.due_date = null));
            return [200, { clearedSubtasks: cleared.length }];
        },
    });
    render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />);
    await screen.findByRole("region", { name: "Dig the beds" });
}

// The task's own date box and Save date: the first on the page, above any subtask's
async function saveTaskDate(date: string) {
    const box = screen.getAllByLabelText("Due date")[0]!;
    await userEvent.clear(box);
    await userEvent.type(box, date);
    await userEvent.click(screen.getAllByRole("button", { name: "Save date" })[0]!);
}

describe("a date box, when the server's date changes", () => {
    it("shows an open subtask's date cleared when its task's date moves earlier", async () => {
        await showGarden("/projects/7/tasks/3/subtasks/9");
        const subtask = within(await screen.findByRole("region", { name: "Turn the soil" }));
        expect(subtask.getByLabelText("Due date")).toHaveProperty("value", "2099-11-25");

        await saveTaskDate("2099-11-18");
        await userEvent.click(await screen.findByRole("button", { name: "Save anyway" }));

        const row = within(screen.getByRole("row", { name: /Turn the soil/ }));
        await waitFor(() => expect(row.getByText("TBD")).toBeDefined());
        expect(subtask.getByLabelText("Due date")).toHaveProperty("value", "");
    });

    it("keeps the focus on Save date once a date is saved", async () => {
        await showGarden("/projects/7/tasks/3");

        await saveTaskDate("2099-11-29");

        const row = within(screen.getByRole("row", { name: /Dig the beds/ }));
        await waitFor(() => expect(row.getByText("2099-11-29")).toBeDefined());
        expect(document.activeElement).toBe(screen.getByRole("button", { name: "Save date" }));
    });
});
