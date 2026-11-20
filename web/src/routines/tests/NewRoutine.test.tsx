import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { routes } from "../../routes";
import { standInApi, type Answer } from "../../testing/standInApi";

const read = { id: "2", user_id: "1", name: "Read", weekdays: [1, 2, 3, 4, 5], due_today: true, done_today: false };

// /routines with no routines yet. Creating one answers 201 with Read, as the API does, unless a test
// gives another answer; after a 201 Read is on the list
async function showRoutines(answerToCreating?: Answer) {
    let routines: unknown[] = [];
    const fetch = standInApi({
        "GET /account": [200, { user: { id: "1", email: "lead@example.com", timezone: "Europe/Zagreb" } }],
        "GET /routines": () => [200, { routines }],
        "GET /routines/2/streak": [200, { streak: 0 }],
        "POST /routines": () => {
            const answer = answerToCreating ?? [201, { routine: read }];
            if (answer[0] === 201) {
                routines = [read];
            }
            return answer;
        },
    });
    const router = createMemoryRouter(routes, { initialEntries: ["/routines"] });
    render(<RouterProvider router={router} />);
    await screen.findByRole("heading", { name: "Routines" });
    return { fetch };
}

function sent(fetch: Awaited<ReturnType<typeof showRoutines>>["fetch"]) {
    return fetch.mock.calls.find(([, init]) => init?.method === "POST")?.[1]?.body;
}

describe("creating a routine", () => {
    it("sends the name and the days ticked, shows the new routine, and empties the form", async () => {
        const { fetch } = await showRoutines();

        await userEvent.type(screen.getByLabelText("Name"), "Read");
        await userEvent.click(screen.getByLabelText("Sat"));
        await userEvent.click(screen.getByLabelText("Sun"));
        await userEvent.click(screen.getByRole("button", { name: "Create routine" }));

        expect(await screen.findByText("Read")).toBeDefined();
        expect(sent(fetch)).toBe('{"name":"Read","weekdays":[1,2,3,4,5]}');
        await waitFor(() => expect(screen.getByLabelText<HTMLInputElement>("Name").value).toBe(""));
        expect(screen.getByLabelText<HTMLInputElement>("Sat").checked).toBe(true);
    });

    it("starts with every day ticked", async () => {
        await showRoutines();

        for (const day of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) {
            expect(screen.getByLabelText<HTMLInputElement>(day).checked).toBe(true);
        }
    });

    it("stops a blank name before sending it", async () => {
        const { fetch } = await showRoutines();

        await userEvent.type(screen.getByLabelText("Name"), "   ");
        await userEvent.click(screen.getByRole("button", { name: "Create routine" }));

        expect(screen.getByText("Give the routine a name")).toBeDefined();
        expect(sent(fetch)).toBeUndefined();
    });

    it("stops a routine with no days before sending it", async () => {
        const { fetch } = await showRoutines();

        await userEvent.type(screen.getByLabelText("Name"), "Read");
        for (const day of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) {
            await userEvent.click(screen.getByLabelText(day));
        }
        await userEvent.click(screen.getByRole("button", { name: "Create routine" }));

        expect(screen.getByText("Pick at least one day")).toBeDefined();
        expect(sent(fetch)).toBeUndefined();
    });

    it("says when the API refuses, and keeps what was typed", async () => {
        await showRoutines([500, { error: "Something went wrong", code: "internal-error" }]);

        await userEvent.type(screen.getByLabelText("Name"), "Read");
        await userEvent.click(screen.getByRole("button", { name: "Create routine" }));

        expect(await screen.findByText("Something went wrong. Try again.")).toBeDefined();
        expect(screen.getByLabelText<HTMLInputElement>("Name").value).toBe("Read");
    });
});