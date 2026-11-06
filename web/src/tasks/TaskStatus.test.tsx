import { describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { routes } from "../routes";
import { standInApi, type Answer } from "../testing/standInApi";

// Garden, with two tasks, opened at the address given. answerToStatus answers a status change
async function showGarden(path: string, answerToStatus: (task: { status: string }) => Answer = () => [204]) {
    const tasks = [
        { id: "3", title: "Dig the beds", status: "in_progress", priority: null, due_date: null, notes: null, assignee_membership_id: null },
        { id: "1", title: "Buy seeds", status: "not_started", priority: null, due_date: null, notes: null, assignee_membership_id: null },
    ];
    const fetch = standInApi({
        "GET /account": [200, { user: { id: "1", email: "lead@example.com" } }],
        "GET /projects": [200, { projects: [{ id: "7", name: "Garden", role: "lead" }] }],
        "GET /projects/7/tasks": () => [200, { tasks }],
        "GET /projects/7/members": [200, { members: [] }],
        "GET /tasks/3/subtasks": [200, { subtasks: [] }],
        "GET /tasks/1/subtasks": [200, { subtasks: [] }],
        "PUT /tasks/3/status": () => answerToStatus(tasks[0]!),
    });
    const router = createMemoryRouter(routes, { initialEntries: [path] });
    render(<RouterProvider router={router} />);
    await screen.findByRole("heading", { name: "Garden" });
    return { router, fetch };
}

describe("a task's status", () => {
    it("saves the moment one is chosen, staying on the task, and the list then shows it", async () => {
        const { router, fetch } = await showGarden("/projects/7/tasks/3", (task) => {
            task.status = "completed";
            return [204];
        });

        await userEvent.selectOptions(await screen.findByLabelText("Status"), "completed");

        const row = screen.getByRole("row", { name: /Dig the beds/ });
        await waitFor(() => expect(within(row).getByText("Completed")).toBeDefined());
        const putting = fetch.mock.calls.find(([, init]) => init?.method === "PUT");
        expect(putting?.[1]?.body).toBe('{"status":"completed"}');
        expect(router.state.location.pathname).toBe("/projects/7/tasks/3");
    });

    it("shows each task's own status when another task is opened", async () => {
        await showGarden("/projects/7/tasks/3");
        expect(await screen.findByLabelText("Status")).toHaveProperty("value", "in_progress");

        await userEvent.click(screen.getByRole("link", { name: "Buy seeds" }));

        await screen.findByRole("region", { name: "Buy seeds" });
        expect(screen.getByLabelText("Status")).toHaveProperty("value", "not_started");
    });

    it("shows a refusal from the API under the status", async () => {
        await showGarden("/projects/7/tasks/3", () => [502]);

        await userEvent.selectOptions(await screen.findByLabelText("Status"), "completed");

        expect(await screen.findByText("Taskco can't be reached. Is the server running?")).toBeDefined();
    });
});