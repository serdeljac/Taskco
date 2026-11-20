import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { routes } from "../../routes";
import { standInApi, type Answer } from "../../testing/standInApi";

const me = { membership_id: "1", user_id: "1", email: "lead@example.com", role: "lead", joined_at: "2026-11-01T09:00:00.000Z" };
const notLoggedIn: Answer = [401, { error: "Log in first", code: "not-logged-in" }];

// /account for someone who leads the given projects, alone in each. Deleting the account answers
// 201, as the API does, and ends the session, unless a test gives another answer
async function showAccount(led: string[], answerToDeleting?: Answer) {
    const session = { loggedIn: true };
    const answers: Record<string, Answer | (() => Answer)> = {
        "GET /account": () =>
            session.loggedIn ? [200, { user: { id: "1", email: "lead@example.com", timezone: "Europe/Zagreb" } }] : notLoggedIn,
        "GET /projects": [
            200,
            { projects: led.map((name, i) => ({ id: String(i + 1), name, role: "lead", deletion_scheduled_at: null })) },
        ],
        "POST /account/deletion": () => {
            const answer = answerToDeleting ?? [201, { scheduledFor: "2026-12-20T10:00:00.000Z" }];
            if (answer[0] === 201) {
                session.loggedIn = false;
            }
            return answer;
        },
    };
    led.forEach((_, i) => {
        answers[`GET /projects/${i + 1}/members`] = [200, { members: [me] }];
    });
    const fetch = standInApi(answers);
    const router = createMemoryRouter(routes, { initialEntries: ["/account"] });
    render(<RouterProvider router={router} />);
    await screen.findByRole("heading", { name: "Account" });
    return { fetch, router };
}

function deleted(fetch: Awaited<ReturnType<typeof showAccount>>["fetch"]) {
    return fetch.mock.calls.some(([url, init]) => url === "/api/account/deletion" && init?.method === "POST");
}

describe("deleting an account", () => {
    it("asks first, saying what goes with it, then deletes it and goes to the login page", async () => {
        const { fetch, router } = await showAccount(["Garden", "Notes"]);

        await userEvent.click(screen.getByRole("button", { name: "Delete account…" }));
        expect(screen.getByText("Delete your account? The 2 projects you still lead go with it.")).toBeDefined();
        await userEvent.click(screen.getByRole("button", { name: "Delete my account" }));

        await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
        expect(deleted(fetch)).toBe(true);
    });

    it("says nothing of projects when the person leads none", async () => {
        await showAccount([]);

        await userEvent.click(screen.getByRole("button", { name: "Delete account…" }));

        expect(screen.getByText("Delete your account?")).toBeDefined();
    });

    it("deletes nothing when the person cancels", async () => {
        const { fetch } = await showAccount(["Garden"]);

        await userEvent.click(screen.getByRole("button", { name: "Delete account…" }));
        await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

        expect(deleted(fetch)).toBe(false);
        expect(screen.getByRole("button", { name: "Delete account…" })).toBeDefined();
    });

    it("says why when the API refuses, and stays", async () => {
        const { router } = await showAccount(["Garden"], [409, { error: "deleteAccount: already being deleted", code: "account-being-deleted" }]);

        await userEvent.click(screen.getByRole("button", { name: "Delete account…" }));
        await userEvent.click(screen.getByRole("button", { name: "Delete my account" }));

        expect(await screen.findByText("This account is already being deleted.")).toBeDefined();
        expect(router.state.location.pathname).toBe("/account");
    });
});