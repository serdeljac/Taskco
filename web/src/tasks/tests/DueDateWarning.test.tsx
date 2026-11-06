import { describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { routes } from "../../routes";
import { standInApi, type Answer } from "../../testing/standInApi";

// Garden's task 3, "Dig the beds", due 2026-11-30, open for its Lead. Two subtasks are due after
// 2026-11-18, so moving the task there clears 2 dates; moving it to 2026-11-29 clears none
async function showTask() {
    const task = { id: "3", title: "Dig the beds", status: "in_progress", priority: null, due_date: "2026-11-30", notes: null, assignee_membership_id: null };
    const subtasks = [
        { id: "9", task_id: "3", title: "Turn the soil", status: "not_started", priority: null, due_date: "2026-11-25", notes: null, assignee_membership_id: null },
        { id: "8", task_id: "3", title: "Edge the beds", status: "not_started", priority: null, due_date: "2026-11-28", notes: null, assignee_membership_id: null },
    ];
    const fetch = standInApi({
        "GET /account": [200, { user: { id: "1", email: "lead@example.com", timezone: "Europe/Zagreb" } }],
        "GET /projects": [200, { projects: [{ id: "7", name: "Garden", role: "lead" }] }],
        "GET /projects/7/tasks": () => [200, { tasks: [task] }],
        "GET /projects/7/members": [200, { members: [] }],
        "GET /tasks/3/subtasks": [200, { subtasks }],
        "GET /tasks/3/due-date-clears?dueDate=2026-11-18": [200, { clears: 2 }],
        "GET /tasks/3/due-date-clears?dueDate=2026-11-29": [200, { clears: 0 }],
        "PUT /tasks/3/due-date": (): Answer => {
            task.due_date = JSON.parse(String(fetch.mock.calls.at(-1)?.[1]?.body)).dueDate;
            return [200, { clearedSubtasks: 0 }];
        },
    });
    render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ["/projects/7/tasks/3"] })} />);
    await screen.findByRole("region", { name: "Dig the beds" });
    return fetch;
}

// Types a date into the task's due date box and presses Save date
async function saveDate(date: string) {
    await userEvent.clear(screen.getByLabelText("Due date"));
    await userEvent.type(screen.getByLabelText("Due date"), date);
    await userEvent.click(screen.getByRole("button", { name: "Save date" }));
}

// Every date sent to the API to be saved, in order
function datesSaved(fetch: ReturnType<typeof standInApi>) {
    return fetch.mock.calls
        .filter(([url, init]) => init?.method === "PUT" && url === "/api/tasks/3/due-date")
        .map(([, init]) => init?.body);
}

// The task's row in the project's list, which shows the date the server has
function listRow() {
    return within(screen.getByRole("row", { name: /Dig the beds/ }));
}

describe("moving a task's due date earlier", () => {
    it("asks first when it would clear subtask dates, and saves nothing", async () => {
        const fetch = await showTask();

        await saveDate("2026-11-18");

        expect(await screen.findByText("Moving the date to 2026-11-18 clears the due dates of 2 subtasks.")).toBeDefined();
        expect(datesSaved(fetch)).toEqual([]);
    });

    it("saves it with Save anyway", async () => {
        const fetch = await showTask();

        await saveDate("2026-11-18");
        await userEvent.click(await screen.findByRole("button", { name: "Save anyway" }));

        await waitFor(() => expect(listRow().getByText("2026-11-18")).toBeDefined());
        expect(datesSaved(fetch)).toEqual(['{"dueDate":"2026-11-18"}']);
        expect(screen.queryByText(/clears the due dates/)).toBeNull();
    });

    it("puts the date back with Cancel, and saves nothing", async () => {
        const fetch = await showTask();

        await saveDate("2026-11-18");
        await userEvent.click(await screen.findByRole("button", { name: "Cancel" }));

        expect(screen.getByLabelText("Due date")).toHaveProperty("value", "2026-11-30");
        expect(screen.queryByText(/clears the due dates/)).toBeNull();
        expect(datesSaved(fetch)).toEqual([]);
    });

    it("saves at once when it would clear none", async () => {
        const fetch = await showTask();

        await saveDate("2026-11-29");

        await waitFor(() => expect(listRow().getByText("2026-11-29")).toBeDefined());
        expect(datesSaved(fetch)).toEqual(['{"dueDate":"2026-11-29"}']);
        expect(screen.queryByRole("button", { name: "Save anyway" })).toBeNull();
    });
});