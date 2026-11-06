import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { routes } from "../../routes";
import { standInApi, type Answer } from "../../testing/standInApi";

// Garden, for someone in the given role, opened at the address given. Task 3, "Dig the beds", has
// two subtasks; task 1, "Buy seeds", has none. A delete takes the row out, as the API's soft
// deletion takes it out of every answer, unless answers says otherwise
async function showGarden(path: string, role: "lead" | "associate", answers: Record<string, Answer> = {}) {
    const tasks = [
        { id: "3", title: "Dig the beds", status: "in_progress", priority: null, due_date: "2099-11-30", notes: null, assignee_membership_id: null },
        { id: "1", title: "Buy seeds", status: "not_started", priority: null, due_date: null, notes: null, assignee_membership_id: null },
    ];
    const subtasks = [
        { id: "9", task_id: "3", title: "Turn the soil", status: "not_started", priority: null, due_date: null, notes: null, assignee_membership_id: null },
        { id: "8", task_id: "3", title: "Edge the beds", status: "not_started", priority: null, due_date: null, notes: null, assignee_membership_id: null },
    ];
    const remove = <T extends { id: string }>(rows: T[], id: string) => (): Answer => {
        rows.splice(rows.findIndex((row) => row.id === id), 1);
        return [204];
    };
    const fetch = standInApi({
        "GET /account": [200, { user: { id: "1", email: "lead@example.com", timezone: "Europe/Zagreb" } }],
        "GET /projects": [200, { projects: [{ id: "7", name: "Garden", role }] }],
        "GET /projects/7/tasks": () => [200, { tasks }],
        "GET /projects/7/members": [200, { members: [] }],
        "GET /tasks/3/subtasks": () => [200, { subtasks }],
        "GET /tasks/1/subtasks": [200, { subtasks: [] }],
        "DELETE /tasks/3": answers["DELETE /tasks/3"] ?? remove(tasks, "3"),
        "DELETE /subtasks/9": answers["DELETE /subtasks/9"] ?? remove(subtasks, "9"),
    });
    const router = createMemoryRouter(routes, { initialEntries: [path] });
    render(<RouterProvider router={router} />);
    await screen.findByRole("heading", { name: "Garden" });
    return { router, fetch };
}

function deletes(fetch: ReturnType<typeof standInApi>) {
    return fetch.mock.calls.filter(([, init]) => init?.method === "DELETE").map(([url]) => url);
}

describe("deleting, for the Lead", () => {
    it("asks before deleting a task, and Cancel deletes nothing", async () => {
        const { fetch } = await showGarden("/projects/7/tasks/3", "lead");

        await userEvent.click(await screen.findByRole("button", { name: "Delete task" }));

        expect(screen.getByText("Delete Dig the beds? Its subtasks go with it.")).toBeDefined();
        expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }));

        await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

        expect(screen.queryByText(/Delete Dig the beds\?/)).toBeNull();
        expect(document.activeElement).toBe(screen.getByRole("button", { name: "Delete task" }));
        expect(deletes(fetch)).toEqual([]);
    });

    it("asks without a word about subtasks when the task has none", async () => {
        await showGarden("/projects/7/tasks/1", "lead");

        await userEvent.click(await screen.findByRole("button", { name: "Delete task" }));

        expect(screen.getByText("Delete Buy seeds?")).toBeDefined();
    });

    it("deletes a task when asked again, and goes back to the project, where it is gone", async () => {
        const { router, fetch } = await showGarden("/projects/7/tasks/3", "lead");

        await userEvent.click(await screen.findByRole("button", { name: "Delete task" }));
        await userEvent.click(screen.getByRole("button", { name: "Delete" }));

        await waitFor(() => expect(router.state.location.pathname).toBe("/projects/7"));
        await waitFor(() => expect(screen.queryByRole("link", { name: "Dig the beds" })).toBeNull());
        expect(screen.queryByRole("region", { name: "Dig the beds" })).toBeNull();
        expect(screen.getByRole("link", { name: "Buy seeds" })).toBeDefined();
        expect(deletes(fetch)).toEqual(["/api/tasks/3"]);
    });

    it("deletes a subtask when asked again, and goes back to its task, where it is gone", async () => {
        const { router, fetch } = await showGarden("/projects/7/tasks/3/subtasks/9", "lead");

        await userEvent.click(await screen.findByRole("button", { name: "Delete subtask" }));
        expect(screen.getByText("Delete Turn the soil?")).toBeDefined();
        await userEvent.click(screen.getByRole("button", { name: "Delete" }));

        await waitFor(() => expect(router.state.location.pathname).toBe("/projects/7/tasks/3"));
        await waitFor(() => expect(screen.queryByRole("link", { name: "Turn the soil" })).toBeNull());
        expect(screen.getByRole("link", { name: "Edge the beds" })).toBeDefined();
        expect(screen.getByRole("region", { name: "Dig the beds" })).toBeDefined();
        expect(deletes(fetch)).toEqual(["/api/subtasks/9"]);
    });

    it("shows a refusal by the button, and stays on the task", async () => {
        const { router } = await showGarden("/projects/7/tasks/3", "lead", { "DELETE /tasks/3": [502] });

        await userEvent.click(await screen.findByRole("button", { name: "Delete task" }));
        await userEvent.click(screen.getByRole("button", { name: "Delete" }));

        expect(await screen.findByText("Taskco can't be reached. Is the server running?")).toBeDefined();
        expect(screen.getByRole("button", { name: "Delete task" })).toBeDefined();
        expect(router.state.location.pathname).toBe("/projects/7/tasks/3");
    });
});

describe("deleting, for an Associate", () => {
    it("is not offered, on a task or a subtask", async () => {
        await showGarden("/projects/7/tasks/3/subtasks/9", "associate");

        await screen.findByRole("region", { name: "Turn the soil" });
        expect(screen.queryByRole("button", { name: "Delete task" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Delete subtask" })).toBeNull();
    });
});
