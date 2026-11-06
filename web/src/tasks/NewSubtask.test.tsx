import { describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { routes } from "../routes";
import { standInApi, type Answer } from "../testing/standInApi";
import { todayIn } from "./today";

const task = { id: "3", title: "Dig the beds", status: "in_progress", priority: null, due_date: "2099-11-30", notes: null, assignee_membership_id: null };

// Garden's task 3 open, for someone in the given role, with no subtasks yet. answerToCreating answers
// a new subtask, and may add it to the list the next load sends
async function showTask(role: "lead" | "associate", answerToCreating?: (subtasks: unknown[]) => Answer) {
    const subtasks: unknown[] = [];
    const fetch = standInApi({
        "GET /account": [200, { user: { id: "1", email: "lead@example.com", timezone: "Europe/Zagreb" } }],
        "GET /projects": [200, { projects: [{ id: "7", name: "Garden", role }] }],
        "GET /projects/7/tasks": [200, { tasks: [task] }],
        "GET /projects/7/members": [200, { members: [] }],
        "GET /tasks/3/subtasks": () => [200, { subtasks }],
        "POST /tasks/3/subtasks": () => (answerToCreating ? answerToCreating(subtasks) : [502]),
    });
    render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ["/projects/7/tasks/3"] })} />);
    await screen.findByRole("region", { name: "Dig the beds" });
    return fetch;
}

function sentBody(fetch: ReturnType<typeof standInApi>) {
    return fetch.mock.calls.find(([, init]) => init?.method === "POST")?.[1]?.body;
}

// Adds the subtask as the API would, at the bottom, and answers it
function created(subtask: { title: string; due_date: string | null }) {
    return (subtasks: unknown[]): Answer => {
        const row = { id: "9", task_id: "3", status: "not_started", priority: null, notes: null, assignee_membership_id: null, ...subtask };
        subtasks.push(row);
        return [201, { subtask: row }];
    };
}

async function open() {
    await userEvent.click(screen.getByRole("button", { name: "New subtask" }));
}

describe("New subtask", () => {
    it("lets the Lead create a subtask with a title and a due date, which then ends the list", async () => {
        const fetch = await showTask("lead", created({ title: "Turn the soil", due_date: "2099-11-20" }));

        await open();
        await userEvent.type(screen.getByLabelText("Subtask title"), "Turn the soil");
        await userEvent.type(screen.getByLabelText("Subtask due date"), "2099-11-20");
        await userEvent.click(screen.getByRole("button", { name: "Create subtask" }));

        const table = await screen.findByRole("table", { name: "Subtasks" });
        expect(within(table).getByRole("row", { name: /Turn the soil/ })).toBeDefined();
        expect(sentBody(fetch)).toBe('{"title":"Turn the soil","dueDate":"2099-11-20"}');
    });

    it("sends no due date when none is chosen", async () => {
        const fetch = await showTask("lead", created({ title: "Turn the soil", due_date: null }));

        await open();
        await userEvent.type(screen.getByLabelText("Subtask title"), "Turn the soil");
        await userEvent.click(screen.getByRole("button", { name: "Create subtask" }));

        await screen.findByRole("table", { name: "Subtasks" });
        expect(sentBody(fetch)).toBe('{"title":"Turn the soil"}');
    });

    it("offers only the days from the account's today to the task's due date", async () => {
        await showTask("lead");

        await open();
        const date = screen.getByLabelText("Subtask due date");
        expect(date.getAttribute("min")).toBe(todayIn("Europe/Zagreb"));
        expect(date.getAttribute("max")).toBe("2099-11-30");
    });

    it("refuses a blank title before anything is sent", async () => {
        const fetch = await showTask("lead");

        await open();
        await userEvent.click(screen.getByRole("button", { name: "Create subtask" }));

        expect(screen.getByText("Give the subtask a title")).toBeDefined();
        expect(sentBody(fetch)).toBeUndefined();
    });

    it("shows the API's refusal in Taskco's words", async () => {
        await showTask("lead", () => [409, { error: "a subtask cannot be due before today", code: "subtask-due-before-today" }]);

        await open();
        await userEvent.type(screen.getByLabelText("Subtask title"), "Turn the soil");
        await userEvent.type(screen.getByLabelText("Subtask due date"), "2020-01-01");
        await userEvent.click(screen.getByRole("button", { name: "Create subtask" }));

        await waitFor(() => expect(screen.getByText("A subtask can't be due before today.")).toBeDefined());
    });

    it("is not there for an Associate", async () => {
        await showTask("associate");

        expect(screen.queryByRole("button", { name: "New subtask" })).toBeNull();
    });
});
