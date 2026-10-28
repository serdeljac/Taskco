import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { routes } from "../routes";

describe("/login", () => {
    it("shows an email field, a password field, and a Log in button", () => {
        const router = createMemoryRouter(routes, { initialEntries: ["/login"] });
        render(<RouterProvider router={router} />);

        expect(screen.getByLabelText("Email")).toBeDefined();
        expect(screen.getByLabelText("Password")).toBeDefined();
        expect(screen.getByRole("button", { name: "Log in" })).toBeDefined();
    });
});