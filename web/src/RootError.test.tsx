import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { ApiError } from "./api/client";
import { RootError } from "./RootError";
import { routes } from "./routes";
import { standInApi } from "./testing/standInApi";

// A page whose loader fails with this error, under the root's error page, next to a stand-in /login
function failWith(error: unknown) {
    const router = createMemoryRouter(
        [
            {
                errorElement: <RootError />,
                hydrateFallbackElement: <p>Loading…</p>,
                children: [
                    {
                        path: "/",
                        loader: () => {
                            throw error;
                        },
                        element: <p>Never shown</p>,
                    },
                    { path: "/login", element: <p>The login page</p> },
                ],
            },
        ],
        { initialEntries: ["/"] }
    );
    render(<RouterProvider router={router} />);
    return router;
}

describe("the root's error page", () => {
    it("turns a 401 into /login", async () => {
        const router = failWith(new ApiError(401, "not-logged-in", "Log in first"));

        expect(await screen.findByText("The login page")).toBeDefined();
        expect(router.state.location.pathname).toBe("/login");
    });

    it("says a refusal in the frontend's words, not React Router's page for developers", async () => {
        failWith(new ApiError(0, "unreachable", "Nothing answered"));

        expect(await screen.findByText("Taskco can't be reached. Is the server running?")).toBeDefined();
        expect(screen.queryByText(/Hey developer/)).toBeNull();
    });

    it("says anything else in one plain sentence", async () => {
        failWith(new TypeError("projects is undefined"));

        expect(await screen.findByText("Something went wrong. Try again.")).toBeDefined();
        expect(screen.queryByText(/projects is undefined/)).toBeNull();
    });

    it("says there is no page at an address that names none, with a way to the projects", async () => {
        standInApi({});
        const router = createMemoryRouter(routes, { initialEntries: ["/nowhere"] });
        render(<RouterProvider router={router} />);

        expect(await screen.findByText("There's no page here.")).toBeDefined();
        expect(screen.queryByText("Something went wrong. Try again.")).toBeNull();
        expect(screen.getByRole("link", { name: "Go to your projects" }).getAttribute("href")).toBe("/");
    });
});
