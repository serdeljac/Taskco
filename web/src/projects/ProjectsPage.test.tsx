import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { routes } from "../routes";
import { standInFetch } from "../testing/standInFetch";

describe("/", () => {
    it("loads the projects from the API, and shows their names", async () => {
        const fetch = standInFetch(200, {
            projects: [
                { id: "1", name: "Website relaunch" },
                { id: "2", name: "Garden" },
            ],
        });
        const router = createMemoryRouter(routes, { initialEntries: ["/"] });
        render(<RouterProvider router={router} />);

        expect(await screen.findByText("Website relaunch")).toBeDefined();
        expect(screen.getByText("Garden")).toBeDefined();
        expect(fetch).toHaveBeenCalledWith("/api/projects", { method: "GET" });
    });
});