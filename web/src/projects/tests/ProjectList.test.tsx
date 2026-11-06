import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { ProjectList } from "../ProjectList";

describe("ProjectList", () => {
    it("shows each project's name, in the order given", () => {
        render(
            <MemoryRouter>
                <ProjectList
                    projects={[
                        { id: "1", name: "Website relaunch" },
                        { id: "2", name: "Garden" },
                    ]}
                />
            </MemoryRouter>
        );

        const items = screen.getAllByRole("listitem");
        expect(items.map((item) => item.textContent)).toEqual(["Website relaunch", "Garden"]);
    });

    it("links each name to its project's page", () => {
        render(
            <MemoryRouter>
                <ProjectList projects={[{ id: "2", name: "Garden" }]} />
            </MemoryRouter>
        );

        const link = screen.getByRole("link", { name: "Garden" });
        expect(link.getAttribute("href")).toBe("/projects/2");
    });

    it("says so when there are no projects", () => {
        render(
            <MemoryRouter>
                <ProjectList projects={[]} />
            </MemoryRouter>
        );

        expect(screen.getByText("No projects yet")).toBeDefined();
        expect(screen.queryByRole("list")).toBeNull();
    });
});