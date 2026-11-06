import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { routes } from "../../routes";
import { standInApi, type Answer } from "../../testing/standInApi";

const lead = { id: "1", email: "lead@example.com" };
const notLoggedIn: Answer = [401, { error: "Log in first", code: "not-logged-in" }];

// / for the Lead, with "Website relaunch" already there, logged in until a test ends the session
async function showProjects(answerToCreating: () => Answer) {
    const session = { loggedIn: true };
    const projects = [{ id: "1", name: "Website relaunch" }];
    const fetch = standInApi({
        "GET /account": () => (session.loggedIn ? [200, { user: lead }] : notLoggedIn),
        "GET /projects": () => (session.loggedIn ? [200, { projects }] : notLoggedIn),
        "POST /projects": answerToCreating,
    });
    const router = createMemoryRouter(routes, { initialEntries: ["/"] });
    render(<RouterProvider router={router} />);
    await screen.findByText("Website relaunch");
    return { router, fetch, projects, session };
}

// What F6's form will do: send a name to /'s action
function sendName(router: ReturnType<typeof createMemoryRouter>, name: string) {
    const formData = new FormData();
    formData.set("name", name);
    return router.navigate("/", { formMethod: "post", formData });
}

describe("creating a project", () => {
    it("sends the name to the API, and the list then shows the new project", async () => {
        const { router, fetch, projects } = await showProjects(() => {
            projects.push({ id: "2", name: "Garden" });
            return [201, { project: { id: "2", name: "Garden" } }];
        });

        await sendName(router, "Garden");

        expect(await screen.findByText("Garden")).toBeDefined();
        const creating = fetch.mock.calls.find(([, init]) => init?.method === "POST");
        expect(creating?.[1]?.body).toBe('{"name":"Garden"}');
    });

    it("returns a refusal to the form, in Taskco's words", async () => {
        const { router } = await showProjects(() => [502]);

        await sendName(router, "Garden");

        await waitFor(() =>
            expect(router.state.actionData?.projects).toEqual({
                refusal: "Taskco can't be reached. Is the server running?",
            })
        );
        expect(router.state.location.pathname).toBe("/");
    });

    it("sends a 401 to /login, like every other 401", async () => {
        const { router, session } = await showProjects(() => notLoggedIn);

        // The session ended elsewhere, so the API refuses creating, and everything else, with 401
        session.loggedIn = false;
        await sendName(router, "Garden");

        expect(await screen.findByLabelText("Email")).toBeDefined();
        expect(router.state.location.pathname).toBe("/login");
    });

    it("shows a refusal beside New project, since the form has closed", async () => {
        await showProjects(() => [502]);

        await userEvent.click(screen.getByRole("button", { name: "New project" }));
        await userEvent.type(screen.getByLabelText("Name"), "Garden");
        await userEvent.click(screen.getByRole("button", { name: "Create" }));

        expect(await screen.findByText("Taskco can't be reached. Is the server running?")).toBeDefined();
        expect(screen.getByRole("button", { name: "New project" })).toBeDefined();
    });
});
