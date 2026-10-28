import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProjectList } from "./ProjectList";

describe("ProjectList", () => {
    it("shows each project's name, in the order given", () => {
        render(
            <ProjectList
                projects={[
                    { id: "1", name: "Website relaunch" },
                    { id: "2", name: "Garden" },
                ]}
            />
        );

        const items = screen.getAllByRole("listitem");
        expect(items.map((item) => item.textContent)).toEqual(["Website relaunch", "Garden"]);
    });

    it("says so when there are no projects", () => {
        render(<ProjectList projects={[]} />);

        expect(screen.getByText("No projects yet")).toBeDefined();
        expect(screen.queryByRole("list")).toBeNull();
    });
});