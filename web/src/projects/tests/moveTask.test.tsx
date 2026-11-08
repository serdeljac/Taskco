import { describe, expect, it, onTestFinished, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
// between the neighbours it names, as the API does. answers adds to what the API says, or replaces it
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
        "GET /tasks/5/subtasks": [200, { subtasks: [] }],
        "PUT /tasks/3/position": move("3"),
        "PUT /tasks/5/position": move("5"),
        ...answers,
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

// What the API was sent to move a task, Water unless another is named
function sent(fetch: ReturnType<typeof standInApi>, taskId = "5") {
    return fetch.mock.calls.find(([url, init]) => init?.method === "PUT" && url === `/api/tasks/${taskId}/position`)?.[1]?.body;
}

// The task titles in the project's table, in the order shown
function titles() {
    const rows = within(screen.getAllByRole("table")[0]!).getAllByRole("row").slice(1);
    return rows.map((row) => within(row).getByRole("link").textContent);
}

// jsdom draws nothing, so every row measures 0 by 0 and a keyboard drag lands in the wrong place.
// For one test, each element in a row measures as the row: 40px high, stacked in the order shown
function giveRowsSizes() {
    const sizes = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
        const row = this.closest("tr");
        const top = row ? [...row.parentElement!.children].indexOf(row) * 40 : 0;
        return { x: 0, y: top, top, left: 0, right: 600, bottom: top + 40, width: 600, height: 40, toJSON: () => ({}) };
    });
    onTestFinished(() => sizes.mockRestore());
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

    it("hands each row's handle to dnd-kit, to pick the row up", async () => {
        await showGarden();

        expect(screen.getByRole("button", { name: "Move Water" }).getAttribute("aria-roledescription")).toBe("sortable");
    });

    it("moves a task up one by keyboard, and sends the two tasks it now sits between", async () => {
        giveRowsSizes();
        const { fetch } = await showGarden();

        screen.getByRole("button", { name: "Move Water" }).focus();
        await userEvent.keyboard(" ");
        await userEvent.keyboard("{ArrowUp}");
        await userEvent.keyboard(" ");

        await waitFor(() => expect(titles()).toEqual(["Dig the beds", "Water", "Buy seeds"]));
        expect(sent(fetch)).toBe('{"afterTaskId":"3","beforeTaskId":"1"}');
    });

    it("moves a task to the top, and sends only the task now below it", async () => {
        giveRowsSizes();
        const { fetch } = await showGarden();

        screen.getByRole("button", { name: "Move Water" }).focus();
        await userEvent.keyboard(" ");
        await userEvent.keyboard("{ArrowUp}");
        await userEvent.keyboard("{ArrowUp}");
        await userEvent.keyboard(" ");

        await waitFor(() => expect(titles()).toEqual(["Water", "Dig the beds", "Buy seeds"]));
        expect(sent(fetch)).toBe('{"beforeTaskId":"3"}');
    });

    it("moves a task to the bottom, and sends only the task now above it", async () => {
        giveRowsSizes();
        const { fetch } = await showGarden();

        screen.getByRole("button", { name: "Move Dig the beds" }).focus();
        await userEvent.keyboard(" ");
        await userEvent.keyboard("{ArrowDown}");
        await userEvent.keyboard("{ArrowDown}");
        await userEvent.keyboard(" ");

        await waitFor(() => expect(titles()).toEqual(["Buy seeds", "Water", "Dig the beds"]));
        expect(sent(fetch, "3")).toBe('{"afterTaskId":"5"}');
    });

    it("puts a task back on Escape, and sends nothing", async () => {
        giveRowsSizes();
        const { fetch } = await showGarden();

        screen.getByRole("button", { name: "Move Water" }).focus();
        await userEvent.keyboard(" ");
        await userEvent.keyboard("{ArrowUp}");
        await userEvent.keyboard("{Escape}");

        expect(titles()).toEqual(["Dig the beds", "Buy seeds", "Water"]);
        expect(sent(fetch)).toBeUndefined();
    });

    it("opens a task from its title, and moves nothing", async () => {
        const { router, fetch } = await showGarden();

        await userEvent.click(screen.getByRole("link", { name: "Water" }));

        expect(await screen.findByRole("heading", { name: "Water" })).toBeDefined();
        expect(router.state.location.pathname).toBe("/projects/7/tasks/5");
        expect(sent(fetch)).toBeUndefined();
    });

    it("shows the new order while the move is on its way", async () => {
        giveRowsSizes();
        const { fetch } = await showGarden();
        // The move is never answered, so only what is being sent can put Water in its new place
        fetch.mockImplementationOnce(() => new Promise<Response>(() => {}));

        screen.getByRole("button", { name: "Move Water" }).focus();
        await userEvent.keyboard(" ");
        await userEvent.keyboard("{ArrowUp}");
        await userEvent.keyboard(" ");

        await waitFor(() => expect(titles()).toEqual(["Dig the beds", "Water", "Buy seeds"]));
        expect(sent(fetch)).toBe('{"afterTaskId":"3","beforeTaskId":"1"}');
    });

    it("puts a refused move back, and says why in Taskco's words", async () => {
        giveRowsSizes();
        await showGarden({
            "PUT /tasks/5/position": [409, { error: "a neighbour was not found", code: "neighbour-not-found" }],
        });

        screen.getByRole("button", { name: "Move Water" }).focus();
        await userEvent.keyboard(" ");
        await userEvent.keyboard("{ArrowUp}");
        await userEvent.keyboard(" ");

        expect((await screen.findByRole("alert")).textContent).toBe("The list changed while you were moving it. Try again.");
        expect(titles()).toEqual(["Dig the beds", "Buy seeds", "Water"]);
    });

    it("tells a screen reader how to move a row, in Taskco's words", async () => {
        await showGarden();

        const handle = screen.getByRole("button", { name: "Move Water" });
        expect(document.getElementById(handle.getAttribute("aria-describedby")!)?.textContent).toBe(
            "Press Space or Enter to pick the row up, the arrow keys to move it, Space or Enter to drop it, and Escape to put it back."
        );
    });

    it("tells a screen reader what was picked up, where it is, and where it was dropped, by title", async () => {
        giveRowsSizes();
        await showGarden();

        screen.getByRole("button", { name: "Move Water" }).focus();
        await userEvent.keyboard(" ");
        // Picked up, Water is over itself, and nothing new is said
        await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Picked up Water."));
        await userEvent.keyboard("{ArrowUp}");
        await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Water is over Buy seeds."));
        await userEvent.keyboard(" ");
        await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Water was dropped over Buy seeds."));
    });

    it("tells a screen reader a row was put back, on Escape", async () => {
        giveRowsSizes();
        await showGarden();

        screen.getByRole("button", { name: "Move Water" }).focus();
        await userEvent.keyboard(" ");
        await userEvent.keyboard("{ArrowUp}");
        await userEvent.keyboard("{Escape}");

        await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Water was put back."));
    });

    it("tells a screen reader a row was dropped where it was, and sends nothing", async () => {
        giveRowsSizes();
        const { fetch } = await showGarden();

        screen.getByRole("button", { name: "Move Water" }).focus();
        await userEvent.keyboard(" ");
        await userEvent.keyboard(" ");

        await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Water was dropped where it was."));
        expect(sent(fetch)).toBeUndefined();
    });

    it("gives an Associate the tasks in order, with no handles to move them", async () => {
        await showGarden({ "GET /projects": [200, { projects: [{ id: "7", name: "Garden", role: "associate" }] }] });

        expect(titles()).toEqual(["Dig the beds", "Buy seeds", "Water"]);
        expect(screen.queryByRole("columnheader", { name: "Move" })).toBeNull();
        expect(screen.queryAllByRole("button", { name: /^Move / })).toEqual([]);
    });
});