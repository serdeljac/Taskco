import { describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { routes } from "../../routes";
import { standInApi, type Answer } from "../../testing/standInApi";

const lead = { membership_id: "1", user_id: "1", email: "lead@example.com", role: "lead", joined_at: "2026-11-01T09:00:00.000Z" };
const ana = { membership_id: "2", user_id: "2", email: "ana@example.com", role: "associate", joined_at: "2026-11-02T09:00:00.000Z" };
const ben = { membership_id: "3", user_id: "3", email: "ben@example.com", role: "associate", joined_at: "2026-11-03T09:00:00.000Z" };

// Garden, with its Lead, Ana and Ben in it, for whoever is logged in. Ending Ana's membership answers
// 204, as the API does, unless a test gives another answer; after a 204 she is off the members list
async function showGarden(who: { user_id: string; email: string; role: string }, answerToEnding: Answer = [204]) {
    let members = [lead, ana, ben];
    const fetch = standInApi({
        "GET /account": [200, { user: { id: who.user_id, email: who.email, timezone: "Europe/Zagreb" } }],
        "GET /projects": [200, { projects: [{ id: "7", name: "Garden", role: who.role }] }],
        "GET /projects/7/tasks": [200, { tasks: [] }],
        "GET /projects/7/members": () => [200, { members }],
        "DELETE /projects/7/members/2": () => {
            if (answerToEnding[0] === 204) {
                members = [lead, ben];
            }
            return answerToEnding;
        },
    });
    const router = createMemoryRouter(routes, { initialEntries: ["/projects/7"] });
    render(<RouterProvider router={router} />);
    await screen.findByRole("heading", { name: "Garden" });
    return { fetch, router };
}

function membersShown() {
    const list = screen.getByRole("list", { name: "Members" });
    return within(list).getAllByRole("listitem").map((item) => item.querySelector("span")?.textContent);
}

describe("removing a member, and leaving a project", () => {
    it("asks the Lead first, then removes the member and shows the list without them", async () => {
        const { fetch } = await showGarden(lead);

        await userEvent.click(screen.getByRole("button", { name: "Remove ana@example.com" }));
        expect(screen.getByText("Remove ana@example.com from Garden? Their tasks go back to nobody.")).toBeDefined();
        await userEvent.click(screen.getByRole("button", { name: "Remove" }));

        await waitFor(() => expect(membersShown()).toEqual(["lead@example.com, Lead", "ben@example.com, Associate"]));
        const ending = fetch.mock.calls.find(([, init]) => init?.method === "DELETE");
        expect(ending?.[0]).toBe("/api/projects/7/members/2");
    });

    it("removes nobody when the Lead cancels", async () => {
        const { fetch } = await showGarden(lead);

        await userEvent.click(screen.getByRole("button", { name: "Remove ana@example.com" }));
        await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

        expect(fetch.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);
        expect(screen.getByRole("button", { name: "Remove ana@example.com" })).toBeDefined();
    });

    it("gives the Lead nothing to remove themselves with, or to leave with", async () => {
        await showGarden(lead);

        expect(screen.queryByRole("button", { name: "Remove lead@example.com" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Leave project" })).toBeNull();
    });

    it("gives an Associate one button, to leave, and none to remove anyone", async () => {
        await showGarden(ana);

        expect(screen.getAllByRole("button", { name: "Leave project" })).toHaveLength(1);
        expect(screen.queryByRole("button", { name: /^Remove/ })).toBeNull();
    });

    it("asks an Associate first, then ends their membership and goes to their projects", async () => {
        const { fetch, router } = await showGarden(ana);

        await userEvent.click(screen.getByRole("button", { name: "Leave project" }));
        expect(screen.getByText("Leave Garden? Your tasks go back to nobody.")).toBeDefined();
        await userEvent.click(screen.getByRole("button", { name: "Leave" }));

        await waitFor(() => expect(router.state.location.pathname).toBe("/"));
        const ending = fetch.mock.calls.find(([, init]) => init?.method === "DELETE");
        expect(ending?.[0]).toBe("/api/projects/7/members/2");
    });

    it("says when the API refuses, and keeps the member on the list", async () => {
        await showGarden(lead, [409, { error: "the project is being deleted", code: "project-being-deleted" }]);

        await userEvent.click(screen.getByRole("button", { name: "Remove ana@example.com" }));
        await userEvent.click(screen.getByRole("button", { name: "Remove" }));

        expect(await screen.findByText("This project is being deleted, so it can't be changed.")).toBeDefined();
        expect(membersShown()).toContain("ana@example.com, Associate");
    });
});