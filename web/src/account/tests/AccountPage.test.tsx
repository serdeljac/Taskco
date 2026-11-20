import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { routes } from "../../routes";
import { standInApi, type Answer } from "../../testing/standInApi";

const me = { membership_id: "1", user_id: "1", email: "lead@example.com", role: "lead", joined_at: "2026-11-01T09:00:00.000Z" };
const ana = { membership_id: "2", user_id: "2", email: "ana@example.com", role: "associate", joined_at: "2026-11-02T09:00:00.000Z" };
const ben = { membership_id: "3", user_id: "3", email: "ben@example.com", role: "associate", joined_at: "2026-11-03T09:00:00.000Z" };

// /account for someone who leads Garden, with Ana and Ben in it, and Notes, alone; who is an
// Associate in Website; and whose Old project is being deleted. Handing Garden over answers 204, as
// the API does, unless a test gives another answer; after a 204 they are an Associate in Garden
async function showAccount(answerToTransfer: Answer = [204]) {
    let gardenRole = "lead";
    const fetch = standInApi({
        "GET /account": [200, { user: { id: "1", email: "lead@example.com", timezone: "Europe/Zagreb" } }],
        "GET /projects": () => [
            200,
            {
                projects: [
                    { id: "7", name: "Garden", role: gardenRole, deletion_scheduled_at: null },
                    { id: "8", name: "Notes", role: "lead", deletion_scheduled_at: null },
                    { id: "9", name: "Website", role: "associate", deletion_scheduled_at: null },
                    { id: "10", name: "Old project", role: "lead", deletion_scheduled_at: "2026-12-01T10:00:00.000Z" },
                ],
            },
        ],
        "GET /projects/7/members": [200, { members: [me, ana, ben] }],
        "GET /projects/8/members": [200, { members: [me] }],
        "POST /projects/7/transfer": () => {
            if (answerToTransfer[0] === 204) {
                gardenRole = "associate";
            }
            return answerToTransfer;
        },
    });
    const router = createMemoryRouter(routes, { initialEntries: ["/account"] });
    render(<RouterProvider router={router} />);
    await screen.findByRole("heading", { name: "Account" });
    return { fetch, router };
}

describe("/account", () => {
    it("lists the projects the person leads, and none they only belong to or are deleting", async () => {
        await showAccount();

        expect(screen.getByText("Garden")).toBeDefined();
        expect(screen.getByText("Notes")).toBeDefined();
        expect(screen.queryByText("Website")).toBeNull();
        expect(screen.queryByText("Old project")).toBeNull();
    });

    it("offers each project's other members, and nobody for a project with none", async () => {
        await showAccount();

        const garden = screen.getByLabelText<HTMLSelectElement>("New Lead for Garden");
        expect(Array.from(garden.options).map((option) => option.textContent)).toEqual(["ana@example.com", "ben@example.com"]);
        const notes = screen.getByLabelText<HTMLSelectElement>("New Lead for Notes");
        expect(notes.disabled).toBe(true);
        expect(notes.options[0]?.textContent).toBe("No members");
        expect(screen.getAllByRole("button", { name: "Hand over…" })).toHaveLength(1);
    });

    it("asks first, then hands the project over, staying on, and it leaves the list", async () => {
        const { fetch } = await showAccount();

        await userEvent.selectOptions(screen.getByLabelText("New Lead for Garden"), "ben@example.com");
        await userEvent.click(screen.getByRole("button", { name: "Hand over…" }));
        expect(screen.getByText("Make ben@example.com the Lead of Garden? You stay on as an Associate.")).toBeDefined();
        await userEvent.click(screen.getByRole("button", { name: "Hand over" }));

        await waitFor(() => expect(screen.queryByText("Garden")).toBeNull());
        const sent = fetch.mock.calls.find(([url]) => url === "/api/projects/7/transfer")?.[1]?.body;
        expect(sent).toBe('{"toUserId":"3","outgoing":"stay"}');
    });

    it("says why when the API refuses", async () => {
        await showAccount([409, { error: "transferLeadership: the new Lead's account is being deleted", code: "new-lead-being-deleted" }]);

        await userEvent.click(screen.getByRole("button", { name: "Hand over…" }));
        await userEvent.click(screen.getByRole("button", { name: "Hand over" }));

        expect(await screen.findByText("Their account is being deleted, so they can't lead.")).toBeDefined();
    });

    it("is reached from the email in the header", async () => {
        standInApi({
            "GET /account": [200, { user: { id: "1", email: "lead@example.com", timezone: "Europe/Zagreb" } }],
            "GET /projects": [200, { projects: [] }],
        });
        const router = createMemoryRouter(routes, { initialEntries: ["/"] });
        render(<RouterProvider router={router} />);

        await userEvent.click(await screen.findByRole("link", { name: "lead@example.com" }));

        expect(await screen.findByText("You lead no projects.")).toBeDefined();
        expect(router.state.location.pathname).toBe("/account");
    });
});