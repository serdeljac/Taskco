import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { routes } from "../../routes";
import { standInApi, type Answer } from "../../testing/standInApi";

const lead = { membership_id: "1", user_id: "1", email: "lead@example.com", role: "lead", joined_at: "2026-11-01T09:00:00.000Z" };

// Garden for someone in the given role, deleted on the given moment or not at all. Putting it into
// delete mode, and undoing that, change what GET /projects says, as the API does; any answer can be
// replaced by a test's own
async function showGarden(
    role: "lead" | "associate",
    scheduledFor: string | null,
    answers: Record<string, Answer> = {}
) {
    let deletion = scheduledFor;
    const fetch = standInApi({
        "GET /account": [200, { user: { id: "1", email: "lead@example.com", timezone: "Europe/Zagreb" } }],
        "GET /projects": () => [200, { projects: [{ id: "7", name: "Garden", role, deletion_scheduled_at: deletion }] }],
        "GET /projects/7/tasks": [200, { tasks: [] }],
        "GET /projects/7/members": [200, { members: [lead] }],
        "POST /projects/7/deletion": () => {
            deletion = "2026-12-19T10:00:00.000Z";
            return [201, { scheduledFor: deletion }];
        },
        "DELETE /projects/7/deletion": () => {
            deletion = null;
            return [204];
        },
        "DELETE /projects/7": [204],
        ...answers,
    });
    const router = createMemoryRouter(routes, { initialEntries: ["/projects/7"] });
    render(<RouterProvider router={router} />);
    await screen.findByRole("heading", { name: "Garden" });
    return { fetch, router };
}

function asked(fetch: Awaited<ReturnType<typeof showGarden>>["fetch"], method: string, url: string) {
    return fetch.mock.calls.some(([sentTo, init]) => sentTo === url && init?.method === method);
}

describe("deleting a project", () => {
    it("asks the Lead first, then puts the project into delete mode and shows its banner", async () => {
        const { fetch } = await showGarden("lead", null);

        await userEvent.click(screen.getByRole("button", { name: "Delete project" }));
        expect(screen.getByText(/^Delete Garden\? In 30 days it is gone/)).toBeDefined();
        await userEvent.click(screen.getByRole("button", { name: "Delete in 30 days" }));

        expect(await screen.findByText("Garden will be deleted on 19 December 2026. Until then you can undo it.")).toBeDefined();
        expect(asked(fetch, "POST", "/api/projects/7/deletion")).toBe(true);
    });

    it("deletes at once, and goes to the projects, when the Lead chooses now", async () => {
        const { fetch, router } = await showGarden("lead", null);

        await userEvent.click(screen.getByRole("button", { name: "Delete project" }));
        await userEvent.click(screen.getByRole("button", { name: "Delete now" }));

        await waitFor(() => expect(router.state.location.pathname).toBe("/"));
        expect(asked(fetch, "DELETE", "/api/projects/7")).toBe(true);
    });

    it("deletes nothing when the Lead cancels", async () => {
        const { fetch } = await showGarden("lead", null);

        await userEvent.click(screen.getByRole("button", { name: "Delete project" }));
        await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

        expect(fetch.mock.calls.some(([, init]) => init?.method === "POST" || init?.method === "DELETE")).toBe(false);
        expect(screen.getByRole("button", { name: "Delete project" })).toBeDefined();
    });

    it("gives an Associate nothing to delete with", async () => {
        await showGarden("associate", null);

        expect(screen.queryByRole("button", { name: "Delete project" })).toBeNull();
    });
});

describe("a project being deleted", () => {
    it("shows its Lead the banner alone, and asks for none of its tasks or members", async () => {
        const { fetch } = await showGarden("lead", "2026-12-19T10:00:00.000Z");

        expect(screen.getByText("Garden will be deleted on 19 December 2026. Until then you can undo it.")).toBeDefined();
        expect(screen.queryByRole("heading", { name: "Tasks" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Delete project" })).toBeNull();
        expect(asked(fetch, "GET", "/api/projects/7/tasks")).toBe(false);
        expect(asked(fetch, "GET", "/api/projects/7/members")).toBe(false);
    });

    it("gives the day in the Lead's own timezone", async () => {
        // 23:30 in London is already the next day in Zagreb
        await showGarden("lead", "2026-12-19T23:30:00.000Z");

        expect(screen.getByText("Garden will be deleted on 20 December 2026. Until then you can undo it.")).toBeDefined();
    });

    it("undoes the deletion, and the project is back as it was", async () => {
        const { fetch } = await showGarden("lead", "2026-12-19T10:00:00.000Z");

        await userEvent.click(screen.getByRole("button", { name: "Undo" }));

        expect(await screen.findByRole("heading", { name: "Tasks" })).toBeDefined();
        expect(screen.queryByText(/will be deleted/)).toBeNull();
        expect(asked(fetch, "DELETE", "/api/projects/7/deletion")).toBe(true);
    });

    it("says when it is too late to undo", async () => {
        await showGarden("lead", "2026-12-19T10:00:00.000Z", {
            "DELETE /projects/7/deletion": [409, { error: "restoreProject: …", code: "project-not-restorable" }],
        });

        await userEvent.click(screen.getByRole("button", { name: "Undo" }));

        expect(await screen.findByText("This project can no longer be brought back.")).toBeDefined();
    });
});