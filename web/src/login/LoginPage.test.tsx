import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { routes } from "../routes";
import { standInFetch } from "../testing/standInFetch";

describe("/login", () => {
    it("shows an email field, a password field, and a Log in button", () => {
        const router = createMemoryRouter(routes, { initialEntries: ["/login"] });
        render(<RouterProvider router={router} />);

        expect(screen.getByLabelText("Email")).toBeDefined();
        expect(screen.getByLabelText("Password")).toBeDefined();
        expect(screen.getByRole("button", { name: "Log in" })).toBeDefined();
    });

    it("says a wrong email or password in Taskco's words, and keeps the email", async () => {
        standInFetch(401, { error: "The email or password is wrong", code: "wrong-email-or-password" });
        const router = createMemoryRouter(routes, { initialEntries: ["/login"] });
        render(<RouterProvider router={router} />);

        await userEvent.type(screen.getByLabelText("Email"), "lead@example.com");
        await userEvent.type(screen.getByLabelText("Password"), "not-the-password");
        await userEvent.click(screen.getByRole("button", { name: "Log in" }));

        expect(await screen.findByText("The email or password is wrong.")).toBeDefined();
        expect(screen.getByLabelText("Email")).toHaveProperty("value", "lead@example.com");
    });

    it("asks the API with what was typed, and leaves /login once it says yes", async () => {
        const fetch = standInFetch(201, { user: { id: "1", email: "lead@example.com" } });
        const router = createMemoryRouter(routes, { initialEntries: ["/login"] });
        render(<RouterProvider router={router} />);

        await userEvent.type(screen.getByLabelText("Email"), "lead@example.com");
        await userEvent.type(screen.getByLabelText("Password"), "taskco-demo");
        await userEvent.click(screen.getByRole("button", { name: "Log in" }));

        await waitFor(() => expect(router.state.location.pathname).toBe("/"));
        expect(fetch.mock.calls[0]?.[1]?.body).toBe('{"email":"lead@example.com","password":"taskco-demo"}');
    });
});