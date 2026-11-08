import { describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { routes } from "../../routes";
import { standInApi, type Answer } from "../../testing/standInApi";

type Task = { id: string; title: string; status: string; priority: null; due_date: null; notes: null; assignee_membership_id: null };

const task = (id: string, title: string): Task => ({
    id,
    title,
    status: "not_started",
    priority: null,
    due_date: null,
    notes: null,
    assignee_membership_id: null,
});

// Garden, for its Lead, with Dig the beds, Buy seeds and Water, in that order. A move puts the task
// between the neighbours it names, as the API does, unless answers says otherwise
async function showGarden(answers: Record<string, Answer> = {}) {
    const tasks = [task("3", "Dig the beds"), task("1", "Buy seeds"), task("5", "Water")];
    const move = (id: string) => (): Answer => {
        const body = JSON.parse(String(fetch.mock.calls.at(-1)?.[1]?.body)) as { afterTaskId?: string; beforeTaskId?: string };
        const moved = tasks.splice(tasks.findIndex((each) => each.id === id), 1)[0]!;
        const at = body.afterTaskId
            ? tasks.findIndex((each) => each.id === body.afterTaskId) + 1
            : tasks.findIndex((each) => each.id === body.beforeTaskId);
        tasks.splice(at, 0, moved);
        return [204];
    };
    const fetch = standInApi({
        "GET /account": [200, { user: { id: "1", email: "lead@example.com" } }],
        "GET /projects": [200, { projects: [{ id: "7", name: "Garden", role: "lead" }] }],
        "GET /projects/7/tasks": () => [200, { tasks }],
        "GET /projects/7/members": [200, { members: [] }],
        "PUT /tasks/5/position": answers["PUT /tasks/5/position"] ?? move("5"),
    });
    const router = createMemoryRouter(routes, { initialEntries: ["/projects/7"] });
    render(<RouterProvider router={router} />);
    await screen.findByRole("heading", { name: "Garden" });
    return { router, fetch };
}

// What F2's drop will send: the intent, the task, and the one or two tasks it now sits between
function sendMove(router: ReturnType<typeof createMemoryRouter>, fields: Record<string, string>) {
    const formData = new FormData();
    formData.set("intent", "move-task");
    for (const [name, value] of Object.entries(fields)) {
        formData.set(name, value);
    }
    return router.navigate("/projects/7", { formMethod: "put", formData });
}

function sent(fetch: ReturnType<typeof standInApi>) {
    return fetch.mock.calls.find(([url, init]) => init?.method === "PUT" && url === "/api/tasks/5/position")?.[1]?.body;
}

// The task titles in the project's table, in the order shown
function titles() {
    const rows = within(screen.getAllByRole("table")[0]!).getAllByRole("row").slice(1);
    return rows.map((row) => within(row).getByRole("link").textContent);
}

describe("moving a task, in the project page's action", () => {
    it("sends the task's two neighbours, and the list then shows the new order", async () => {
        const { router, fetch } = await showGarden();

        await sendMove(router, { taskId: "5", afterTaskId: "3", beforeTaskId: "1" });

        await waitFor(() => expect(titles()).toEqual(["Dig the beds", "Water", "Buy seeds"]));
        expect(sent(fetch)).toBe('{"afterTaskId":"3","beforeTaskId":"1"}');
    });

    it("sends only the neighbour there is, at the top of the list", async () => {
        const { router, fetch } = await showGarden();

        await sendMove(router, { taskId: "5", beforeTaskId: "3" });

        await waitFor(() => expect(titles()).toEqual(["Water", "Dig the beds", "Buy seeds"]));
        expect(sent(fetch)).toBe('{"beforeTaskId":"3"}');
    });

    it("returns a refusal in Taskco's words", async () => {
        const { router } = await showGarden({
            "PUT /tasks/5/position": [409, { error: "a neighbour was not found", code: "neighbour-not-found" }],
        });

        await sendMove(router, { taskId: "5", afterTaskId: "3", beforeTaskId: "1" });

        await waitFor(() =>
            expect(router.state.actionData?.project).toEqual({ refusal: "The list changed while you were moving it. Try again." })
        );
        expect(titles()).toEqual(["Dig the beds", "Buy seeds", "Water"]);
    });

    describe("dragging a task in the project's table", () => {
        it("starts each task's row with a handle named for it", async () => {
            await showGarden();

            const rows = within(screen.getAllByRole("table")[0]!).getAllByRole("row").slice(1);
            const handles = rows.map((row) => within(within(row).getAllByRole("cell")[0]!).getByRole("button"));
            expect(handles.map((handle) => handle.getAttribute("aria-label"))).toEqual([
                "Move Dig the beds",
                "Move Buy seeds",
                "Move Water",
            ]);
        });
    });
});
