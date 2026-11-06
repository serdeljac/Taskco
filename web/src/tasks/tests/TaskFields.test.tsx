import { describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { routes } from "../../routes";
import { standInApi, type Answer } from "../../testing/standInApi";

const members = [
    { membership_id: "1", user_id: "1", email: "lead@example.com", role: "lead", joined_at: "2026-11-01T09:00:00.000Z" },
    { membership_id: "2", user_id: "2", email: "ana@example.com", role: "associate", joined_at: "2026-11-02T09:00:00.000Z" },
];

type Task = {
    id: string;
    title: string;
    status: string;
    priority: string | null;
    due_date: string | null;
    notes: string | null;
    assignee_membership_id: string | null;
};

// Garden's task 3 open, for someone in the given role. Each PUT stores what it was sent, the way
// the API would, unless answers says otherwise
async function showTask(role: "lead" | "associate", answers: Record<string, Answer> = {}) {
    const task: Task = {
        id: "3",
        title: "Dig the beds",
        status: "in_progress",
        priority: "high",
        due_date: "2026-11-20",
        notes: "Mind the roots",
        assignee_membership_id: "1",
    };
    const store = (field: keyof Task, key: string) => (): Answer => {
        const body = JSON.parse(String(fetch.mock.calls.at(-1)?.[1]?.body));
        (task as Record<string, unknown>)[field] = body[key];
        return [204];
    };
    const fetch = standInApi({
        "GET /account": [200, { user: { id: "1", email: "lead@example.com" } }],
        "GET /projects": [200, { projects: [{ id: "7", name: "Garden", role }] }],
        "GET /projects/7/tasks": () => [200, { tasks: [task] }],
        "GET /projects/7/members": [200, { members }],
        "GET /tasks/3/subtasks": [200, { subtasks: [] }],
        "PUT /tasks/3/status": store("status", "status"),
        "PUT /tasks/3/priority": answers["PUT /tasks/3/priority"] ?? store("priority", "priority"),
        "PUT /tasks/3/due-date": answers["PUT /tasks/3/due-date"] ?? store("due_date", "dueDate"),
        "PUT /tasks/3/assignee": answers["PUT /tasks/3/assignee"] ?? store("assignee_membership_id", "membershipId"),
        "PUT /tasks/3/notes": answers["PUT /tasks/3/notes"] ?? store("notes", "notes"),
    });
    render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ["/projects/7/tasks/3"] })} />);
    await screen.findByRole("region", { name: "Dig the beds" });
    return fetch;
}

function sent(fetch: ReturnType<typeof standInApi>, path: string) {
    const call = fetch.mock.calls.find(([url, init]) => init?.method === "PUT" && url === `/api${path}`);
    return call?.[1]?.body;
}

function listRow() {
    return within(screen.getByRole("row", { name: /Dig the beds/ }));
}

describe("a task's other fields, for the Lead", () => {
    it("saves a priority the moment one is chosen, and Not set as null", async () => {
        const fetch = await showTask("lead");

        await userEvent.selectOptions(screen.getByLabelText("Priority"), "low");
        await waitFor(() => expect(listRow().getByText("Low")).toBeDefined());
        expect(sent(fetch, "/tasks/3/priority")).toBe('{"priority":"low"}');

        fetch.mockClear();
        await userEvent.selectOptions(screen.getByLabelText("Priority"), "");
        await waitFor(() => expect(listRow().getByText("Not set")).toBeDefined());
        expect(sent(fetch, "/tasks/3/priority")).toBe('{"priority":null}');
    });

    it("saves a due date with its button, and an emptied one as null, shown as TBD", async () => {
        const fetch = await showTask("lead");

        await userEvent.clear(screen.getByLabelText("Due date"));
        await userEvent.type(screen.getByLabelText("Due date"), "2026-12-01");
        await userEvent.click(screen.getByRole("button", { name: "Save date" }));
        await waitFor(() => expect(listRow().getByText("2026-12-01")).toBeDefined());
        expect(sent(fetch, "/tasks/3/due-date")).toBe('{"dueDate":"2026-12-01"}');

        fetch.mockClear();
        await userEvent.clear(screen.getByLabelText("Due date"));
        await userEvent.click(screen.getByRole("button", { name: "Save date" }));
        await waitFor(() => expect(listRow().getByText("TBD")).toBeDefined());
        expect(sent(fetch, "/tasks/3/due-date")).toBe('{"dueDate":null}');
    });

    it("saves an assignee the moment one is chosen, by membership, and Nobody as null", async () => {
        const fetch = await showTask("lead");

        await userEvent.selectOptions(screen.getByLabelText("Assigned to"), "ana@example.com");
        await waitFor(() => expect(listRow().getByText("ana@example.com")).toBeDefined());
        expect(sent(fetch, "/tasks/3/assignee")).toBe('{"membershipId":"2"}');

        fetch.mockClear();
        await userEvent.selectOptions(screen.getByLabelText("Assigned to"), "Nobody");
        await waitFor(() => expect(listRow().getByText("Nobody")).toBeDefined());
        expect(sent(fetch, "/tasks/3/assignee")).toBe('{"membershipId":null}');
    });

    it("saves notes with their button", async () => {
        const fetch = await showTask("lead");

        await userEvent.clear(screen.getByLabelText("Notes"));
        await userEvent.type(screen.getByLabelText("Notes"), "Compost first");
        await userEvent.click(screen.getByRole("button", { name: "Save notes" }));

        await waitFor(() => expect(sent(fetch, "/tasks/3/notes")).toBe('{"notes":"Compost first"}'));
    });

    it("shows a refusal by the field that was refused", async () => {
        await showTask("lead", {
            "PUT /tasks/3/assignee": [409, { error: "not a member", code: "assignee-not-a-member" }],
        });

        await userEvent.selectOptions(screen.getByLabelText("Assigned to"), "ana@example.com");

        const refusal = await screen.findByRole("alert");
        expect(refusal.textContent).toBe("Something went wrong. Try again.");
        expect(refusal.closest("dd")?.previousElementSibling?.textContent).toBe("Assigned to");
    });
});

describe("a task's fields, for an Associate", () => {
    it("shows priority, due date and assignee as words, with nothing to change them", async () => {
        await showTask("associate");

        expect(screen.queryByLabelText("Priority")).toBeNull();
        expect(screen.queryByLabelText("Due date")).toBeNull();
        expect(screen.queryByLabelText("Assigned to")).toBeNull();
        const page = within(screen.getByRole("region", { name: "Dig the beds" }));
        expect(page.getByText("High")).toBeDefined();
        expect(page.getByText("2026-11-20")).toBeDefined();
        expect(page.getByText("lead@example.com")).toBeDefined();
    });

    it("can still change the status and the notes", async () => {
        const fetch = await showTask("associate");

        await userEvent.clear(screen.getByLabelText("Notes"));
        await userEvent.type(screen.getByLabelText("Notes"), "Compost first");
        await userEvent.click(screen.getByRole("button", { name: "Save notes" }));

        await waitFor(() => expect(sent(fetch, "/tasks/3/notes")).toBe('{"notes":"Compost first"}'));
        expect(screen.getByLabelText("Status")).toBeDefined();
    });
});
