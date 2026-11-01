import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { routes } from "../routes";
import { standInApi, type Answer } from "../testing/standInApi";

const lead = {
    id: "1",
    email: "lead@example.com",
    timezone: "Europe/Zagreb",
    created_at: "2026-10-01T09:00:00.000Z",
    deletion_scheduled_at: null,
};
const notLoggedIn: Answer = [401, { error: "Log in first", code: "not-logged-in" }];

// The API as the Lead meets it, logged in until the session ends: by logging out here, or by a
// test setting loggedIn to false, the way logging out in another tab would
function theLeadsApi() {
    const session = { loggedIn: true };
    const fetch = standInApi({
        "GET /account": () => (session.loggedIn ? [200, { user: lead }] : notLoggedIn),
        "GET /projects": () =>
            session.loggedIn ? [200, { projects: [{ id: "1", name: "Website relaunch" }] }] : notLoggedIn,
        "DELETE /sessions/current": () => {
            session.loggedIn = false;
            return [204];
        },
    });
    return { session, fetch };
}

function show(path: string) {
    const router = createMemoryRouter(routes, { initialEntries: [path] });
    render(<RouterProvider router={router} />);
    return router;
}

describe("who is logged in", () => {
    it("shows the account's email and a Log out button above the projects", async () => {
        theLeadsApi();
        show("/");

        expect(await screen.findByText("Website relaunch")).toBeDefined();
        expect(screen.getByText("lead@example.com")).toBeDefined();
        expect(screen.getByRole("button", { name: "Log out" })).toBeDefined();
    });

    it("shows Loading… while the first page waits for its data", () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(() => new Promise<Response>(() => {}))
        );
        show("/");

        expect(screen.getByText("Loading…")).toBeDefined();
    });

    it("sends someone who is not logged in to /login", async () => {
        standInApi({ "GET /account": notLoggedIn, "GET /projects": notLoggedIn });
        const router = show("/");

        expect(await screen.findByLabelText("Email")).toBeDefined();
        expect(router.state.location.pathname).toBe("/login");
    });

    it("logs out: ends the session, and goes to /login", async () => {
        const { session } = theLeadsApi();
        const router = show("/");

        await userEvent.click(await screen.findByRole("button", { name: "Log out" }));

        expect(await screen.findByLabelText("Email")).toBeDefined();
        expect(router.state.location.pathname).toBe("/login");
        expect(session.loggedIn).toBe(false);
    });

    it("goes to /login when Log out is pressed after the session already ended elsewhere", async () => {
        const session = { loggedIn: true };
        standInApi({
            "GET /account": () => (session.loggedIn ? [200, { user: lead }] : notLoggedIn),
            "GET /projects": () => (session.loggedIn ? [200, { projects: [] }] : notLoggedIn),
            "DELETE /sessions/current": notLoggedIn,
        });
        const router = show("/");
        const logOut = await screen.findByRole("button", { name: "Log out" });

        session.loggedIn = false;
        await userEvent.click(logOut);

        expect(await screen.findByLabelText("Email")).toBeDefined();
        expect(router.state.location.pathname).toBe("/login");
    });

    it("does not bring the projects back with the back button, once logged out", async () => {
        const { fetch } = theLeadsApi();
        const router = show("/");
        await userEvent.click(await screen.findByRole("button", { name: "Log out" }));
        await screen.findByLabelText("Email");
        const askedBefore = fetch.mock.calls.length;

        await router.navigate(-1);

        await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
        expect(fetch.mock.calls.length).toBeGreaterThan(askedBefore);
        expect(screen.queryByText("Website relaunch")).toBeNull();
    });

    it("sends the next navigation to /login once the session has ended elsewhere", async () => {
        const { session } = theLeadsApi();
        const router = show("/");
        await screen.findByText("Website relaunch");

        session.loggedIn = false;
        await router.navigate("/");

        await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
        expect(screen.queryByText("Website relaunch")).toBeNull();
    });
});
