import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { routes } from "../../routes";
import { standInApi, type Answer } from "../../testing/standInApi";

// Garden, with task 3 open, for someone in the given role. A rename is stored as the API would
// store it, unless answers says otherwise
async function showTask(role: "lead" | "associate", answers: Record<string, Answer> = {}) {
    const project = { id: "7", name: "Garden", role };
    const task = { id: "3", title: "Dig the beds", status: "not_started", priority: null, due_date: null, notes: null, assignee_membership_id: null };
    const lastBody = () => JSON.parse(String(fetch.mock.calls.at(-1)?.[1]?.body));
    const fetch = standInApi({
        "GET /account": [200, { user: { id: "1", email: "lead@example.com" } }],
        "GET /projects": () => [200, { projects: [project] }],
        "GET /projects/7/tasks": () => [200, { tasks: [task] }],
        "GET /projects/7/members": [200, { members: [] }],
        "GET /tasks/3/subtasks": [200, { subtasks: [] }],
        "PUT /tasks/3/title": answers["PUT /tasks/3/title"] ?? (() => ((task.title = lastBody().title), [204])),
        "PUT /projects/7/name": answers["PUT /projects/7/name"] ?? (() => ((project.name = lastBody().name), [204])),
    });
    render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ["/projects/7/tasks/3"] })} />);
    await screen.findByRole("region", { name: "Dig the beds" });
    return fetch;
}

function sent(fetch: ReturnType<typeof standInApi>, method: string) {
    return fetch.mock.calls.find(([, init]) => init?.method === method)?.[1]?.body;
}

describe("renaming", () => {
    it("lets the Lead rename a task, and the list and its page show the new title", async () => {
        const fetch = await showTask("lead");

        await userEvent.clear(screen.getByLabelText("Title"));
        await userEvent.type(screen.getByLabelText("Title"), "Dig the raised beds");
        await userEvent.click(screen.getByRole("button", { name: "Save title" }));

        expect(await screen.findByRole("region", { name: "Dig the raised beds" })).toBeDefined();
        expect(screen.getByRole("link", { name: "Dig the raised beds" })).toBeDefined();
        expect(sent(fetch, "PUT")).toBe('{"title":"Dig the raised beds"}');
    });

    it("lets the Lead rename the project", async () => {
        const fetch = await showTask("lead");

        await userEvent.clear(screen.getByLabelText("Name"));
        await userEvent.type(screen.getByLabelText("Name"), "Vegetable garden");
        await userEvent.click(screen.getByRole("button", { name: "Save name" }));

        expect(await screen.findByRole("heading", { name: "Vegetable garden" })).toBeDefined();
        expect(sent(fetch, "PUT")).toBe('{"name":"Vegetable garden"}');
    });

    it("refuses a blank title or name before anything is sent", async () => {
        const fetch = await showTask("lead");

        await userEvent.clear(screen.getByLabelText("Title"));
        await userEvent.type(screen.getByLabelText("Title"), "   ");
        await userEvent.click(screen.getByRole("button", { name: "Save title" }));
        await userEvent.clear(screen.getByLabelText("Name"));
        await userEvent.click(screen.getByRole("button", { name: "Save name" }));

        expect(screen.getByText("Give the task a title")).toBeDefined();
        expect(screen.getByText("Give the project a name")).toBeDefined();
        expect(sent(fetch, "PUT")).toBeUndefined();
    });

    it("shows a refusal from the API by the name refused", async () => {
        await showTask("lead", {
            "PUT /projects/7/name": [409, { error: "the project is being deleted", code: "project-being-deleted" }],
        });

        await userEvent.type(screen.getByLabelText("Name"), " patch");
        await userEvent.click(screen.getByRole("button", { name: "Save name" }));

        await waitFor(() => expect(screen.getByText("Something went wrong. Try again.")).toBeDefined());
    });

    it("is not there for an Associate", async () => {
        await showTask("associate");

        expect(screen.queryByLabelText("Title")).toBeNull();
        expect(screen.queryByLabelText("Name")).toBeNull();
    });
});
