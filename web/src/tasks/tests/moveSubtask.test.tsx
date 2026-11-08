import { describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { routes } from "../../routes";
import { standInApi, type Answer } from "../../testing/standInApi";

const subtask = (id: string, title: string) => ({
    id,
    task_id: "3",
    title,
    status: "not_started",
    priority: null,
    due_date: null,
    notes: null,
    assignee_membership_id: null,
});

// Garden's task 3, Dig the beds, open for its Lead, with Turn the soil, Edge the beds and Rake it
// level, in that order. A move puts the subtask between the neighbours it names, as the API does.
// answers adds to what the API says, or replaces it
async function showTask(answers: Record<string, Answer> = {}) {
    const subtasks = [subtask("9", "Turn the soil"), subtask("8", "Edge the beds"), subtask("6", "Rake it level")];
    const move = (id: string) => (): Answer => {
        const body = JSON.parse(String(fetch.mock.calls.at(-1)?.[1]?.body)) as { afterSubtaskId?: string; beforeSubtaskId?: string };
        const moved = subtasks.splice(subtasks.findIndex((each) => each.id === id), 1)[0]!;
        const at = body.afterSubtaskId
            ? subtasks.findIndex((each) => each.id === body.afterSubtaskId) + 1
            : subtasks.findIndex((each) => each.id === body.beforeSubtaskId);
        subtasks.splice(at, 0, moved);
        return [204];
    };
    const fetch = standInApi({
        "GET /account": [200, { user: { id: "1", email: "lead@example.com", timezone: "Europe/Zagreb" } }],
        "GET /projects": [200, { projects: [{ id: "7", name: "Garden", role: "lead" }] }],
        "GET /projects/7/tasks": [
            200,
            { tasks: [{ id: "3", title: "Dig the beds", status: "not_started", priority: null, due_date: null, notes: null, assignee_membership_id: null }] },
        ],
        "GET /projects/7/members": [200, { members: [] }],
        "GET /tasks/3/subtasks": () => [200, { subtasks }],
        "PUT /subtasks/6/position": move("6"),
        "PUT /subtasks/9/position": move("9"),
        ...answers,
    });
    const router = createMemoryRouter(routes, { initialEntries: ["/projects/7/tasks/3"] });
    render(<RouterProvider router={router} />);
    await screen.findByRole("table", { name: "Subtasks" });
    return { router, fetch };
}

// What a drop will send: the intent, the subtask, and the one or two subtasks it now sits between
function sendMove(router: ReturnType<typeof createMemoryRouter>, fields: Record<string, string>) {
    const formData = new FormData();
    formData.set("intent", "move-subtask");
    for (const [name, value] of Object.entries(fields)) {
        formData.set(name, value);
    }
    return router.navigate("/projects/7/tasks/3", { formMethod: "put", formData });
}

// What the API was sent to move a subtask, Rake it level unless another is named
function sent(fetch: ReturnType<typeof standInApi>, subtaskId = "6") {
    return fetch.mock.calls.find(([url, init]) => init?.method === "PUT" && url === `/api/subtasks/${subtaskId}/position`)?.[1]?.body;
}

// The subtask titles in the task's table, in the order shown
function titles() {
    const rows = within(screen.getByRole("table", { name: "Subtasks" })).getAllByRole("row").slice(1);
    return rows.map((row) => within(row).getByRole("link").textContent);
}

describe("moving a subtask, in the task page's action", () => {
    it("sends the subtask's two neighbours, and the list then shows the new order", async () => {
        const { router, fetch } = await showTask();

        await sendMove(router, { subtaskId: "6", afterSubtaskId: "9", beforeSubtaskId: "8" });

        await waitFor(() => expect(titles()).toEqual(["Turn the soil", "Rake it level", "Edge the beds"]));
        expect(sent(fetch)).toBe('{"afterSubtaskId":"9","beforeSubtaskId":"8"}');
    });

    it("sends only the neighbour there is, at the top of the list", async () => {
        const { router, fetch } = await showTask();

        await sendMove(router, { subtaskId: "6", beforeSubtaskId: "9" });

        await waitFor(() => expect(titles()).toEqual(["Rake it level", "Turn the soil", "Edge the beds"]));
        expect(sent(fetch)).toBe('{"beforeSubtaskId":"9"}');
    });

    it("returns a refusal in Taskco's words", async () => {
        const { router } = await showTask({
            "PUT /subtasks/6/position": [409, { error: "a neighbour was not found", code: "neighbour-not-found" }],
        });

        await sendMove(router, { subtaskId: "6", afterSubtaskId: "9", beforeSubtaskId: "8" });

        await waitFor(() =>
            expect(router.state.actionData?.task).toEqual({ refusal: "The list changed while you were moving it. Try again." })
        );
        expect(titles()).toEqual(["Turn the soil", "Edge the beds", "Rake it level"]);
    });
});
