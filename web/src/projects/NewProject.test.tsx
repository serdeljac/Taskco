import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { routes } from "../routes";
import { standInApi } from "../testing/standInApi";


// / for someone whose list already has Garden in it
async function showProjects() {
    const fetch = standInApi({
        "GET /account": [200, { user: { id: "1", email: "lead@example.com" } }],
        "GET /projects": [200, { projects: [{ id: "1", name: "Garden" }] }],
        "POST /projects": [201, { project: { id: "2", name: "Garden" } }],
    });
    const router = createMemoryRouter(routes, { initialEntries: ["/"] });
    render(<RouterProvider router={router} />);
    await screen.findByText("Garden");
    return fetch;
}

describe("NewProject", () => {
    it("opens a name field, and Cancel closes it and forgets what was typed", async () => {
        await showProjects();

        await userEvent.click(screen.getByRole("button", { name: "New project" }));
        await userEvent.type(screen.getByLabelText("Name"), "Kitchen");
        await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

        expect(screen.queryByLabelText("Name")).toBeNull();
        await userEvent.click(screen.getByRole("button", { name: "New project" }));
        expect(screen.getByLabelText("Name")).toHaveProperty("value", "");
    });

    it("refuses a blank name and sends nothing, and Cancel forgets the refusal", async () => {
        const fetch = await showProjects();

        await userEvent.click(screen.getByRole("button", { name: "New project" }));
        await userEvent.type(screen.getByLabelText("Name"), "   ");
        await userEvent.click(screen.getByRole("button", { name: "Create" }));

        expect(screen.getByText("Give the project a name")).toBeDefined();
        expect(fetch.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);

        await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
        await userEvent.click(screen.getByRole("button", { name: "New project" }));
        expect(screen.queryByText("Give the project a name")).toBeNull();
    });

    it("hints at a name already in the list, in any case, but not at a new one", async () => {
        await showProjects();

        await userEvent.click(screen.getByRole("button", { name: "New project" }));
        await userEvent.type(screen.getByLabelText("Name"), "garden ");
        expect(screen.getByText("You already have a project called Garden.")).toBeDefined();

        await userEvent.clear(screen.getByLabelText("Name"));
        await userEvent.type(screen.getByLabelText("Name"), "Kitchen");
        expect(screen.queryByText(/already have a project/)).toBeNull();
    });

    it("still sends a name already in the list, and clears an earlier refusal", async () => {
        const fetch = await showProjects();

        await userEvent.click(screen.getByRole("button", { name: "New project" }));
        await userEvent.click(screen.getByRole("button", { name: "Create" }));
        expect(screen.getByText("Give the project a name")).toBeDefined();

        await userEvent.type(screen.getByLabelText("Name"), "Garden");
        expect(screen.getByText("You already have a project called Garden.")).toBeDefined();
        await userEvent.click(screen.getByRole("button", { name: "Create" }));

        await waitFor(() => {
            const creating = fetch.mock.calls.find(([, init]) => init?.method === "POST");
            expect(creating?.[1]?.body).toBe('{"name":"Garden"}');
        });
        expect(screen.queryByText("Give the project a name")).toBeNull();
    });

    it("closes once a name is sent, and opens again empty", async () => {
        await showProjects();

        await userEvent.click(screen.getByRole("button", { name: "New project" }));
        await userEvent.type(screen.getByLabelText("Name"), "Kitchen");
        await userEvent.click(screen.getByRole("button", { name: "Create" }));

        expect(screen.queryByLabelText("Name")).toBeNull();
        await userEvent.click(screen.getByRole("button", { name: "New project" }));
        expect(screen.getByLabelText("Name")).toHaveProperty("value", "");
    });
});

