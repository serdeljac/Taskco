import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { routes } from "../routes";
import { standInApi } from "../testing/standInApi";

const lead = { id: "1", email: "lead@example.com" };

describe("/projects/:projectId", () => {
    it("shows the project's name, and its tasks' titles in the order sent", async () => {
        standInApi({
            "GET /account": [200, { user: lead }],
            "GET /projects": [200, { projects: [{ id: "7", name: "Garden", role: "lead" }] }],
            "GET /projects/7/tasks": [
                200,
                {
                    tasks: [
                        { id: "3", title: "Dig the beds" },
                        { id: "1", title: "Buy seeds" },
                    ],
                },
            ],
        });
        const router = createMemoryRouter(routes, { initialEntries: ["/projects/7"] });
        render(<RouterProvider router={router} />);

        expect(await screen.findByRole("heading", { name: "Garden" })).toBeDefined();
        const items = screen.getAllByRole("listitem");
        expect(items.map((item) => item.textContent)).toEqual(["Dig the beds", "Buy seeds"]);
    });

    it("says there's no page for a project the person isn't in", async () => {
        standInApi({
            "GET /account": [200, { user: lead }],
            "GET /projects": [200, { projects: [] }],
        });
        const router = createMemoryRouter(routes, { initialEntries: ["/projects/99"] });
        render(<RouterProvider router={router} />);

        expect(await screen.findByText("There's no page here.")).toBeDefined();
    });
});