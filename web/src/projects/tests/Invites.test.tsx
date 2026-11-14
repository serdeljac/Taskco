import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { routes } from "../../routes";
import { standInApi, type Answer } from "../../testing/standInApi";

// / for Ben, who is in "Website relaunch" and has been invited to Garden by its Lead. Accepting puts
// Garden in his projects and takes the invite away, and declining takes it away, as the API does,
// unless answers says otherwise
async function showInvites(answers: Record<string, Answer> = {}, invited = true) {
    const projects = [{ id: "1", name: "Website relaunch", role: "associate" }];
    const invites = invited
        ? [{ id: "9", project_id: "7", project_name: "Garden", invited_by_email: "lead@example.com" }]
        : [];
    const fetch = standInApi({
        "GET /account": [200, { user: { id: "2", email: "ben@example.com", timezone: "Europe/Zagreb" } }],
        "GET /projects": () => [200, { projects }],
        "GET /invites": () => [200, { invites }],
        "POST /invites/9/accept":
            answers["POST /invites/9/accept"] ??
            (() => {
                projects.push({ id: "7", name: "Garden", role: "associate" });
                invites.length = 0;
                return [200, { projectId: "7" }];
            }),
        "DELETE /invites/9":
            answers["DELETE /invites/9"] ??
            (() => {
                invites.length = 0;
                return [204];
            }),
        "GET /projects/7/tasks": [200, { tasks: [] }],
        "GET /projects/7/members": [200, { members: [] }],
    });
    const router = createMemoryRouter(routes, { initialEntries: ["/"] });
    render(<RouterProvider router={router} />);
    await screen.findByText("Website relaunch");
    return { router, fetch };
}

describe("invites, on /", () => {
    it("shows an invite by its project and who sent it", async () => {
        await showInvites();

        expect(screen.getByRole("heading", { name: "Invites" })).toBeDefined();
        expect(screen.getByText("Garden, from lead@example.com")).toBeDefined();
    });

    it("says nothing about invites when there are none", async () => {
        await showInvites({}, false);

        expect(screen.queryByRole("heading", { name: "Invites" })).toBeNull();
    });

    it("accepts an invite, and opens the project", async () => {
        const { router, fetch } = await showInvites();

        await userEvent.click(screen.getByRole("button", { name: "Accept Garden" }));

        expect(await screen.findByRole("heading", { name: "Garden" })).toBeDefined();
        expect(router.state.location.pathname).toBe("/projects/7");
        expect(fetch).toHaveBeenCalledWith("/api/invites/9/accept", { method: "POST" });
    });

    it("declines an invite, which then leaves the list", async () => {
        const { router, fetch } = await showInvites();

        await userEvent.click(screen.getByRole("button", { name: "Decline Garden" }));

        await waitFor(() => expect(screen.queryByText("Garden, from lead@example.com")).toBeNull());
        expect(router.state.location.pathname).toBe("/");
        expect(fetch).toHaveBeenCalledWith("/api/invites/9", { method: "DELETE" });
    });

    it("says an invite has expired, in Taskco's words", async () => {
        await showInvites({
            "POST /invites/9/accept": [409, { error: "acceptInvite: this invite has expired", code: "invite-expired" }],
        });

        await userEvent.click(screen.getByRole("button", { name: "Accept Garden" }));

        expect(await screen.findByText("That invite has expired. Ask for a new one.")).toBeDefined();
    });

    it("says an invite is gone when it was withdrawn meanwhile", async () => {
        await showInvites({
            "DELETE /invites/9": [404, { error: "Not found", code: "not-found" }],
        });

        await userEvent.click(screen.getByRole("button", { name: "Decline Garden" }));

        expect(await screen.findByText("That invite is no longer there.")).toBeDefined();
    });
});