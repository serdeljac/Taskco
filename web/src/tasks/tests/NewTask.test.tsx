import { describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { routes } from "../../routes";
import { standInApi, type Answer } from "../../testing/standInApi";

const members = [
    { membership_id: "1", user_id: "1", email: "lead@example.com", role: "lead", joined_at: "2026-11-01T09:00:00.000Z" },
];

// /projects/7, Garden, with one task, for someone in the given role. answerToCreating answers the
// new task, and may add it to the list the next load sends
async function showGarden(role: "lead" | "associate", answerToCreating?: (tasks: unknown[]) => Answer) {
    const tasks: unknown[] = [{ id: "1", title: "Buy seeds", status: "not_started", priority: null, due_date: null, assignee_membership_id: null }];
    const fetch = standInApi({
        "GET /account": [200, { user: { id: "1", email: "lead@example.com" } }],
        "GET /projects": [200, { projects: [{ id: "7", name: "Garden", role }] }],
        "GET /projects/7/tasks": () => [200, { tasks }],
        "GET /projects/7/members": [200, { members }],
        "POST /projects/7/tasks": () => (answerToCreating ? answerToCreating(tasks) : [502]),
    });
    const router = createMemoryRouter(routes, { initialEntries: ["/projects/7"] });
    render(<RouterProvider router={router} />);
    await screen.findByRole("heading", { name: "Garden" });
    return fetch;
}

function sentBody(fetch: ReturnType<typeof standInApi>) {
    return fetch.mock.calls.find(([, init]) => init?.method === "POST")?.[1]?.body;
}

// Adds the task as the API would, at the bottom, and answers it
function created(task: { title: string; due_date: string | null }) {
    return (tasks: unknown[]): Answer => {
        const row = { id: "2", status: "not_started", priority: null, assignee_membership_id: null, ...task };
        tasks.push(row);
        return [201, { task: row }];
    };
}

describe("New task", () => {
    it("lets the Lead create a task with a title and a due date, which then ends the list", async () => {
        const fetch = await showGarden("lead", created({ title: "Water the beds", due_date: "2026-11-20" }));

        await userEvent.click(screen.getByRole("button", { name: "New task" }));
        await userEvent.type(screen.getByLabelText("Title"), "Water the beds");
        await userEvent.type(screen.getByLabelText("Due date"), "2026-11-20");
        await userEvent.click(screen.getByRole("button", { name: "Create" }));

        const row = await screen.findByRole("row", { name: /Water the beds/ });
        expect(within(row).getByText("2026-11-20")).toBeDefined();
        expect(screen.getAllByRole("row").at(-1)).toBe(row);
        expect(sentBody(fetch)).toBe('{"title":"Water the beds","dueDate":"2026-11-20"}');
        expect(screen.queryByLabelText("Title")).toBeNull();
    });

    it("sends no due date when none is chosen", async () => {
        const fetch = await showGarden("lead", created({ title: "Water the beds", due_date: null }));

        await userEvent.click(screen.getByRole("button", { name: "New task" }));
        await userEvent.type(screen.getByLabelText("Title"), "Water the beds");
        await userEvent.click(screen.getByRole("button", { name: "Create" }));

        await screen.findByRole("row", { name: /Water the beds/ });
        expect(sentBody(fetch)).toBe('{"title":"Water the beds"}');
    });

    it("refuses a blank title before anything is sent", async () => {
        const fetch = await showGarden("lead");

        await userEvent.click(screen.getByRole("button", { name: "New task" }));
        await userEvent.type(screen.getByLabelText("Title"), "   ");
        await userEvent.click(screen.getByRole("button", { name: "Create" }));

        expect(screen.getByText("Give the task a title")).toBeDefined();
        expect(sentBody(fetch)).toBeUndefined();
    });

    it("shows a refusal from the API under New task, since the form has closed", async () => {
        await showGarden("lead");

        await userEvent.click(screen.getByRole("button", { name: "New task" }));
        await userEvent.type(screen.getByLabelText("Title"), "Water the beds");
        await userEvent.click(screen.getByRole("button", { name: "Create" }));

        await waitFor(() =>
            expect(screen.getByText("Taskco can't be reached. Is the server running?")).toBeDefined()
        );
        expect(screen.getByRole("button", { name: "New task" })).toBeDefined();
    });

    it("is not there for an Associate, who cannot create tasks", async () => {
        await showGarden("associate");

        expect(screen.queryByRole("button", { name: "New task" })).toBeNull();
    });
});
