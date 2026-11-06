import { describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { routes } from "../routes";
import { standInApi, type Answer } from "../testing/standInApi";

const notLoggedIn: Answer = [401, { error: "Log in first", code: "not-logged-in" }];

// Garden's task 3 open, for its Lead, logged in until a test ends the session
async function showTask(answerToStatus: (task: { status: string }) => Answer) {
    const session = { loggedIn: true };
    const task = { id: "3", title: "Dig the beds", status: "not_started", priority: null, due_date: null, notes: null, assignee_membership_id: null };
    const fetch = standInApi({
        "GET /account": () => (session.loggedIn ? [200, { user: { id: "1", email: "lead@example.com" } }] : notLoggedIn),
        "GET /projects": () => (session.loggedIn ? [200, { projects: [{ id: "7", name: "Garden", role: "lead" }] }] : notLoggedIn),
        "GET /projects/7/tasks": () => (session.loggedIn ? [200, { tasks: [task] }] : notLoggedIn),
        "GET /projects/7/members": () => (session.loggedIn ? [200, { members: [] }] : notLoggedIn),
        "PUT /tasks/3/status": () => answerToStatus(task),
    });
    const router = createMemoryRouter(routes, { initialEntries: ["/projects/7/tasks/3"] });
    render(<RouterProvider router={router} />);
    await screen.findByRole("region", { name: "Dig the beds" });
    return { router, fetch, session };
}

// What F2's form will do: send one field to the task page's action
function send(router: ReturnType<typeof createMemoryRouter>, field: string, value: string) {
    const formData = new FormData();
    formData.set(field, value);
    return router.navigate("/projects/7/tasks/3", { formMethod: "put", formData });
}

describe("changing a task", () => {
    it("sends a status to the API, and the list then shows it", async () => {
        const { router, fetch } = await showTask((task) => {
            task.status = "completed";
            return [204];
        });

        await send(router, "status", "completed");

        const row = screen.getByRole("row", { name: /Dig the beds/ });
        await waitFor(() => expect(within(row).getByText("Completed")).toBeDefined());
        const putting = fetch.mock.calls.find(([, init]) => init?.method === "PUT");
        expect(putting?.[1]?.body).toBe('{"status":"completed"}');
    });

    it("returns a refusal to the page, in Taskco's words", async () => {
        const { router } = await showTask(() => [502]);

        await send(router, "status", "completed");

        await waitFor(() =>
            expect(router.state.actionData?.task).toEqual({ refusal: "Taskco can't be reached. Is the server running?" })
        );
    });

    it("sends a 401 to /login, like every other 401", async () => {
        const { router, session } = await showTask(() => notLoggedIn);

        session.loggedIn = false;
        await send(router, "status", "completed");

        expect(await screen.findByLabelText("Email")).toBeDefined();
        expect(router.state.location.pathname).toBe("/login");
    });
});
