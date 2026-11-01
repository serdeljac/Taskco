import type { ActionFunctionArgs } from "react-router";
import { api, ApiError } from "../api/client";
import type { Project } from "../api/types";
import { wordsFor } from "../api/words";

// /'s action: creates a project with the name sent, as typed; the API trims it. After every action
// the router reloads /'s data, so the list then shows the new project. A refusal goes back to the
// form in Taskco's words. A 401 does too, but the reload that follows is refused as well, and the
// root's error page sends that to /login
export async function createProjectAction({ request }: ActionFunctionArgs) {
    const form = await request.formData();

    try {
        // A new project has no role in it: that comes only with the list
        const { project } = await api<{ project: Omit<Project, "role"> }>("POST", "/projects", {
            name: form.get("name"),
        });
        return { project };
    } catch (error) {
        if (error instanceof ApiError) {
            return { refusal: wordsFor(error.code) };
        }
        throw error;
    }
}
