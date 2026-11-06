import { describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { routes } from "../../routes";
import { standInApi, type Answer } from "../../testing/standInApi";
import { todayIn } from "../today";

const members = [
    { membership_id: "1", user_id: "1", email: "lead@example.com", role: "lead", joined_at: "2026-11-01T09:00:00.000Z" },
    { membership_id: "2", user_id: "2", email: "ana@example.com", role: "associate", joined_at: "2026-11-02T09:00:00.000Z" },
];

// Garden's task 3 with two subtasks, opened at the address given, for someone in the given role. A
// change to subtask 9 is stored as the API would store it, unless answers says otherwise
async function showGarden(path: string, role: "lead" | "associate" = "lead", answers: Record<string, Answer> = {}) {
    const task = { id: "3", title: "Dig the beds", status: "in_progress", priority: null, due_date: "2099-11-30", notes: null, assignee_membership_id: "1" };
    const subtasks = [
        { id: "9", task_id: "3", title: "Turn the soil", status: "in_progress", priority: "high", due_date: "2099-11-20", notes: "Two spits deep", assignee_membership_id: "2" },
        { id: "8", task_id: "3", title: "Edge the beds", status: "not_started", priority: null, due_date: null, notes: null, assignee_membership_id: null },
    ];
    const store = (field: string, key: string) => (): Answer => {
        const body = JSON.parse(String(fetch.mock.calls.at(-1)?.[1]?.body));
        (subtasks[0] as Record<string, unknown>)[field] = body[key];
        return [204];
    };
    const fetch = standInApi({
        "GET /account": [200, { user: { id: "1", email: "lead@example.com", timezone: "Europe/Zagreb" } }],
        "GET /projects": [200, { projects: [{ id: "7", name: "Garden", role }] }],
        "GET /projects/7/tasks": [200, { tasks: [task] }],
        "GET /projects/7/members": [200, { members }],
        "GET /tasks/3/subtasks": () => [200, { subtasks }],
        "PUT /subtasks/9/status": answers["PUT /subtasks/9/status"] ?? store("status", "status"),
        "PUT /subtasks/9/due-date": answers["PUT /subtasks/9/due-date"] ?? store("due_date", "dueDate"),
        "PUT /subtasks/9/title": answers["PUT /subtasks/9/title"] ?? store("title", "title"),
    });
    const router = createMemoryRouter(routes, { initialEntries: [path] });
    render(<RouterProvider router={router} />);
    await screen.findByRole("region", { name: "Dig the beds" });
    return { router, fetch };
}

function subtaskPage(name: string) {
    return within(screen.getByRole("region", { name }));
}

function subtaskRow(name: RegExp) {
    return within(within(screen.getByRole("table", { name: "Subtasks" })).getByRole("row", { name }));
}

describe("a subtask's page", () => {
    it("opens from its title in the task's list, under it, with its own fields", async () => {
        const { router } = await showGarden("/projects/7/tasks/3");

        await userEvent.click(screen.getByRole("link", { name: "Turn the soil" }));

        const page = within(await screen.findByRole("region", { name: "Turn the soil" }));
        expect(router.state.location.pathname).toBe("/projects/7/tasks/3/subtasks/9");
        expect(page.getByLabelText("Status")).toHaveProperty("value", "in_progress");
        expect(page.getByLabelText("Priority")).toHaveProperty("value", "high");
        expect(page.getByLabelText("Due date")).toHaveProperty("value", "2099-11-20");
        expect(page.getByLabelText("Assigned to")).toHaveProperty("value", "2");
        expect(page.getByLabelText("Notes")).toHaveProperty("value", "Two spits deep");
    });

    it("saves a status through the subtask's own endpoint, and the task's list shows it", async () => {
        const { fetch } = await showGarden("/projects/7/tasks/3/subtasks/9");

        await userEvent.selectOptions(subtaskPage("Turn the soil").getByLabelText("Status"), "completed");

        await waitFor(() => expect(subtaskRow(/Turn the soil/).getByText("Completed")).toBeDefined());
        const putting = fetch.mock.calls.find(([, init]) => init?.method === "PUT");
        expect(putting?.[0]).toBe("/api/subtasks/9/status");
    });

    it("offers due dates from the account's today to the task's, and says a refusal in Taskco's words", async () => {
        await showGarden("/projects/7/tasks/3/subtasks/9", "lead", {
            "PUT /subtasks/9/due-date": [409, { error: "a subtask cannot be due after its task", code: "subtask-due-after-task" }],
        });
        const page = subtaskPage("Turn the soil");
        const date = page.getByLabelText("Due date");
        expect(date.getAttribute("min")).toBe(todayIn("Europe/Zagreb"));
        expect(date.getAttribute("max")).toBe("2099-11-30");

        await userEvent.clear(date);
        await userEvent.type(date, "2099-12-05");
        await userEvent.click(page.getByRole("button", { name: "Save date" }));

        expect(await page.findByText("A subtask can't be due after its task.")).toBeDefined();
    });

    it("lets the Lead rename it", async () => {
        const { fetch } = await showGarden("/projects/7/tasks/3/subtasks/9");
        const page = subtaskPage("Turn the soil");

        await userEvent.clear(page.getByLabelText("Title"));
        await userEvent.type(page.getByLabelText("Title"), "Turn and rake the soil");
        await userEvent.click(page.getByRole("button", { name: "Save title" }));

        expect(await screen.findByRole("region", { name: "Turn and rake the soil" })).toBeDefined();
        expect(fetch.mock.calls.find(([, init]) => init?.method === "PUT")?.[0]).toBe("/api/subtasks/9/title");
    });

    it("shows an Associate only the status and the notes to change", async () => {
        await showGarden("/projects/7/tasks/3/subtasks/9", "associate");
        const page = subtaskPage("Turn the soil");

        expect(page.getByLabelText("Status")).toBeDefined();
        expect(page.getByLabelText("Notes")).toBeDefined();
        expect(page.queryByLabelText("Priority")).toBeNull();
        expect(page.queryByLabelText("Due date")).toBeNull();
        expect(page.queryByLabelText("Assigned to")).toBeNull();
        expect(page.queryByLabelText("Title")).toBeNull();
    });

    it("shows another subtask's own values when it is opened", async () => {
        await showGarden("/projects/7/tasks/3/subtasks/9");

        await userEvent.click(screen.getByRole("link", { name: "Edge the beds" }));

        const page = within(await screen.findByRole("region", { name: "Edge the beds" }));
        expect(page.getByLabelText("Status")).toHaveProperty("value", "not_started");
        expect(page.getByLabelText("Notes")).toHaveProperty("value", "");
    });

    it("says there's no subtask here for an id not in the list", async () => {
        await showGarden("/projects/7/tasks/3/subtasks/99");

        expect(await screen.findByText("There's no subtask here.")).toBeDefined();
    });
});
