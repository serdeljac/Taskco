import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { routes } from "../../routes";
import { standInApi, type Answer } from "../../testing/standInApi";

// Garden, for someone in the given role. Inviting answers 201 with the invite, as the API does,
// unless a test gives another answer
async function showGarden(role: "lead" | "associate", answerToInviting?: Answer) {
    const fetch = standInApi({
        "GET /account": [200, { user: { id: "1", email: "lead@example.com", timezone: "Europe/Zagreb" } }],
        "GET /projects": [200, { projects: [{ id: "7", name: "Garden", role }] }],
        "GET /projects/7/tasks": [200, { tasks: [] }],
        "GET /projects/7/members": [200, { members: [] }],
        "POST /projects/7/invites": answerToInviting ?? [201, { invite: { id: "9", project_id: "7", email: "ben@example.com" } }],
    });
    const router = createMemoryRouter(routes, { initialEntries: ["/projects/7"] });
    render(<RouterProvider router={router} />);
    await screen.findByRole("heading", { name: "Garden" });
    return { fetch };
}

async function invite(email: string) {
    await userEvent.type(screen.getByLabelText("Invite by email"), email);
    await userEvent.click(screen.getByRole("button", { name: "Invite" }));
}

describe("inviting someone to a project", () => {
    it("sends the Lead's invite, says so, and empties the field for the next one", async () => {
        const { fetch } = await showGarden("lead");

        await invite("ben@example.com");

        expect(await screen.findByText("Invited ben@example.com. They have three days to accept.")).toBeDefined();
        const inviting = fetch.mock.calls.find(([, init]) => init?.method === "POST");
        expect(inviting?.[0]).toBe("/api/projects/7/invites");
        expect(inviting?.[1]?.body).toBe('{"email":"ben@example.com"}');
        expect(screen.getByLabelText<HTMLInputElement>("Invite by email").value).toBe("");
    });

    it("gives an Associate nothing to invite with", async () => {
        await showGarden("associate");

        expect(screen.queryByLabelText("Invite by email")).toBeNull();
        expect(screen.queryByRole("button", { name: "Invite" })).toBeNull();
    });

    it("says when no account uses the address, and keeps what was typed", async () => {
        await showGarden("lead", [409, { error: "No email found", code: "no-account" }]);

        await invite("nobody@example.com");

        expect(await screen.findByText("No Taskco account uses that email.")).toBeDefined();
        expect(screen.getByLabelText<HTMLInputElement>("Invite by email").value).toBe("nobody@example.com");
    });

    it("says when they are already a member", async () => {
        await showGarden("lead", [409, { error: "createInvite: they are already a member of this project", code: "already-a-member" }]);

        await invite("ben@example.com");

        expect(await screen.findByText("They are already a member of this project.")).toBeDefined();
    });

    it("says when the API finds the address is not one", async () => {
        await showGarden("lead", [400, { error: "The request body is not valid", code: "invalid-body" }]);

        await invite("ben@example");

        expect(await screen.findByText("That doesn't look like an email address.")).toBeDefined();
    });
});