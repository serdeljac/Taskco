import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { routes } from "../../routes";
import { standInApi, type Answer } from "../../testing/standInApi";

const lead = { membership_id: "1", user_id: "1", email: "lead@example.com", role: "lead", joined_at: "2026-11-01T09:00:00.000Z" };
const ana = { membership_id: "2", user_id: "2", email: "ana@example.com", role: "associate", joined_at: "2026-11-02T09:00:00.000Z" };
const ben = { membership_id: "3", user_id: "3", email: "ben@example.com", role: "associate", joined_at: "2026-11-03T09:00:00.000Z" };

// Garden for its Lead, with these members. Handing over answers 204, as the API does, unless a test
// gives another answer; after a 204 the Lead is an Associate, and Ben leads
async function showGarden(members: unknown[], answerToTransfer: Answer = [204]) {
    let role = "lead";
    const fetch = standInApi({
        "GET /account": [200, { user: { id: "1", email: "lead@example.com", timezone: "Europe/Zagreb" } }],
        "GET /projects": () => [200, { projects: [{ id: "7", name: "Garden", role }] }],
        "GET /projects/7/tasks": [200, { tasks: [] }],
        "GET /projects/7/members": [200, { members }],
        "POST /projects/7/transfer": () => {
            if (answerToTransfer[0] === 204) {
                role = "associate";
            }
            return answerToTransfer;
        },
    });
    const router = createMemoryRouter(routes, { initialEntries: ["/projects/7"] });
    render(<RouterProvider router={router} />);
    await screen.findByRole("heading", { name: "Garden" });
    return { fetch, router };
}

async function handOver(to: string, then: "Stay on as an Associate" | "Leave the project") {
    await userEvent.selectOptions(screen.getByLabelText("New Lead"), to);
    await userEvent.click(screen.getByLabelText(then));
    await userEvent.click(screen.getByRole("button", { name: "Hand over…" }));
}

function sent(fetch: Awaited<ReturnType<typeof showGarden>>["fetch"]) {
    return fetch.mock.calls.find(([url]) => url === "/api/projects/7/transfer")?.[1]?.body;
}

describe("handing a project over", () => {
    it("asks first, then makes the chosen member Lead, and the old Lead an Associate", async () => {
        const { fetch } = await showGarden([lead, ana, ben]);

        await handOver("ben@example.com", "Stay on as an Associate");
        expect(screen.getByText("Make ben@example.com the Lead of Garden? You stay on as an Associate.")).toBeDefined();
        await userEvent.click(screen.getByRole("button", { name: "Hand over" }));

        // Now an Associate: nothing to hand over, and a way to leave
        expect(await screen.findByRole("button", { name: "Leave project" })).toBeDefined();
        expect(screen.queryByLabelText("New Lead")).toBeNull();
        expect(sent(fetch)).toBe('{"toUserId":"3","outgoing":"stay"}');
    });

    it("sends the old Lead to their projects when they leave", async () => {
        const { fetch, router } = await showGarden([lead, ana, ben]);

        await handOver("ana@example.com", "Leave the project");
        expect(screen.getByText("Make ana@example.com the Lead of Garden? You leave the project.")).toBeDefined();
        await userEvent.click(screen.getByRole("button", { name: "Hand over" }));

        await waitFor(() => expect(router.state.location.pathname).toBe("/"));
        expect(sent(fetch)).toBe('{"toUserId":"2","outgoing":"leave"}');
    });

    it("hands over nothing when the Lead cancels", async () => {
        const { fetch } = await showGarden([lead, ana]);

        await handOver("ana@example.com", "Stay on as an Associate");
        await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

        expect(sent(fetch)).toBeUndefined();
        expect(screen.getByRole("button", { name: "Hand over…" })).toBeDefined();
    });

    it("offers no hand-over when there is nobody to hand to", async () => {
        await showGarden([lead]);

        expect(screen.queryByLabelText("New Lead")).toBeNull();
    });

    it("says why when the API refuses", async () => {
        await showGarden([lead, ana], [409, { error: "transferLeadership: the new Lead's account is being deleted", code: "new-lead-being-deleted" }]);

        await handOver("ana@example.com", "Stay on as an Associate");
        await userEvent.click(screen.getByRole("button", { name: "Hand over" }));

        expect(await screen.findByText("Their account is being deleted, so they can't lead.")).toBeDefined();
    });
});