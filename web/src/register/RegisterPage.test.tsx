import { describe, expect, it, onTestFinished, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { routes } from "../routes";
import { standInApi, type Answer } from "../testing/standInApi";

const notLoggedIn: Answer = [401, { error: "Log in first", code: "not-logged-in" }];
const newUser = { id: "3", email: "new@example.com" };

// /register for someone logged out. answers adds to what the API says, or replaces it
function showRegister(answers: Record<string, Answer | (() => Answer)> = {}) {
    const fetch = standInApi({ "GET /account": notLoggedIn, ...answers });
    const router = createMemoryRouter(routes, { initialEntries: ["/register"] });
    render(<RouterProvider router={router} />);
    return { router, fetch };
}

async function register(email: string, password: string) {
    await userEvent.type(await screen.findByLabelText("Email"), email);
    if (password !== "") {
        await userEvent.type(screen.getByLabelText("Password"), password);
    }
    await userEvent.click(screen.getByRole("button", { name: "Register" }));
}

function sentAnything(fetch: ReturnType<typeof standInApi>) {
    return fetch.mock.calls.some(([, init]) => init?.method === "POST");
}

describe("/register", () => {
    it("shows an email field, a password field, a Register button, and a way to log in instead", async () => {
        showRegister();

        expect(await screen.findByLabelText("Email")).toBeDefined();
        expect(screen.getByLabelText("Password")).toBeDefined();
        expect(screen.getByRole("button", { name: "Register" })).toBeDefined();
        expect(screen.getByRole("link", { name: "Log in" })).toBeDefined();
    });

    it("refuses an address that doesn't look like one, before anything is sent, and keeps it", async () => {
        const { fetch } = showRegister();

        await register("new.example.com", "taskco-demo");

        expect(await screen.findByText("That doesn't look like an email address.")).toBeDefined();
        expect(screen.getByLabelText("Email")).toHaveProperty("value", "new.example.com");
        expect(sentAnything(fetch)).toBe(false);
    });

    it("refuses a password under 8 characters or over 128, before anything is sent", async () => {
        const { fetch } = showRegister();

        await register("new@example.com", "short");
        expect(await screen.findByText("A password needs 8 to 128 characters.")).toBeDefined();

        await userEvent.clear(screen.getByLabelText("Password"));
        await userEvent.click(screen.getByLabelText("Password"));
        await userEvent.paste("x".repeat(129));
        await userEvent.click(screen.getByRole("button", { name: "Register" }));
        await waitFor(() => expect(screen.getByLabelText("Password")).toHaveProperty("value", "x".repeat(129)));
        expect(screen.getByText("A password needs 8 to 128 characters.")).toBeDefined();
        expect(sentAnything(fetch)).toBe(false);
    });

    it("sends what was typed with the browser's own timezone, and lands on / logged in", async () => {
        // Node on Windows can report no timezone at all, so the browser's is pinned here
        const known = new Intl.DateTimeFormat().resolvedOptions();
        const timezone = vi
            .spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions")
            .mockReturnValue({ ...known, timeZone: "Europe/Zagreb" });
        onTestFinished(() => timezone.mockRestore());

        const session = { loggedIn: false };
        const { router, fetch } = showRegister({
            "GET /account": () => (session.loggedIn ? [200, { user: newUser }] : notLoggedIn),
            "POST /users": () => {
                session.loggedIn = true;
                return [201, { user: newUser }];
            },
            "GET /projects": [200, { projects: [] }],
        });

        await register("new@example.com", "taskco-demo");

        expect(await screen.findByText("No projects yet")).toBeDefined();
        expect(router.state.location.pathname).toBe("/");
        const registering = fetch.mock.calls.find(([, init]) => init?.method === "POST");
        expect(registering?.[1]?.body).toBe(
            JSON.stringify({ email: "new@example.com", password: "taskco-demo", timezone: "Europe/Zagreb" })
        );
    });

    it.each([
        [480, "Etc/GMT+8"],
        [-120, "Etc/GMT-2"],
    ])("works the timezone out from the clock when the browser names none: %i minutes is %s", async (offset, zone) => {
        // A computer set to a zone too new for the browser's data, 8 hours behind UTC or 2 ahead
        const known = new Intl.DateTimeFormat().resolvedOptions();
        const named = vi
            .spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions")
            .mockReturnValue({ ...known, timeZone: undefined as unknown as string });
        const clock = vi.spyOn(Date.prototype, "getTimezoneOffset").mockReturnValue(offset);
        onTestFinished(() => {
            named.mockRestore();
            clock.mockRestore();
        });
        const { fetch } = showRegister({ "POST /users": [409, { error: "refused", code: "email-taken" }] });

        await register("new@example.com", "taskco-demo");

        await waitFor(() => {
            const registering = fetch.mock.calls.find(([, init]) => init?.method === "POST");
            expect(JSON.parse(String(registering?.[1]?.body)).timezone).toBe(zone);
        });
    });

    it.each([
        ["email-taken", "An account already uses that email. Log in instead?"],
        ["unknown-timezone", "Your browser's timezone isn't one Taskco knows."],
    ])("says the API's %s in Taskco's words, and keeps the email", async (code, words) => {
        showRegister({ "POST /users": [409, { error: "refused", code }] });

        await register("new@example.com", "taskco-demo");

        expect(await screen.findByText(words)).toBeDefined();
        expect(screen.getByLabelText("Email")).toHaveProperty("value", "new@example.com");
    });

    it("says an address the API's stricter rule refuses doesn't look like one", async () => {
        showRegister({ "POST /users": [400, { error: "The body is not valid", code: "invalid-body", issues: [] }] });

        // Past the check in the browser, but the API wants at least two letters after the last dot
        await register("new@example.c", "taskco-demo");

        expect(await screen.findByText("That doesn't look like an email address.")).toBeDefined();
    });

    it("links /login and /register to each other", async () => {
        standInApi({ "GET /account": notLoggedIn });
        const router = createMemoryRouter(routes, { initialEntries: ["/login"] });
        render(<RouterProvider router={router} />);

        await userEvent.click(await screen.findByRole("link", { name: "Register" }));
        expect(await screen.findByRole("heading", { name: "Register" })).toBeDefined();

        await userEvent.click(screen.getByRole("link", { name: "Log in" }));
        expect(await screen.findByRole("heading", { name: "Log in" })).toBeDefined();
    });

    it("sends someone already logged in on to /", async () => {
        const { router } = showRegister({
            "GET /account": [200, { user: newUser }],
            "GET /projects": [200, { projects: [] }],
        });

        expect(await screen.findByText("No projects yet")).toBeDefined();
        expect(router.state.location.pathname).toBe("/");
    });
});
