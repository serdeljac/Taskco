import { redirect, type ActionFunctionArgs } from "react-router";
import { api, ApiError } from "../api/client";
import type { Project } from "../api/types";
import { wordsFor } from "../api/words";

// /'s action. An answer to an invite says what it is with its intent, read first: accepting opens
// the project it was to, and declining stays here. Anything else creates a project with the name
// sent, as typed; the API trims it. After every action the router reloads /'s data, so the lists
// then show what changed. A refusal goes back to the form in Taskco's words. A 401 does too, but the
// reload that follows is refused as well, and the root's error page sends that to /login
export async function createProjectAction({ request }: ActionFunctionArgs) {
    const form = await request.formData();

    try {
        if (form.get("intent") === "accept-invite") {
            const { projectId } = await api<{ projectId: string }>("POST", `/invites/${form.get("inviteId")}/accept`);
            return redirect(`/projects/${projectId}`);
        }

        if (form.get("intent") === "decline-invite") {
            await api<void>("DELETE", `/invites/${form.get("inviteId")}`);
            return null;
        }

        // A new project has no role in it: that comes only with the list
        const { project } = await api<{ project: Omit<Project, "role"> }>("POST", "/projects", {
            name: form.get("name"),
        });
        return { project };
    } catch (error) {
        if (error instanceof ApiError) {
            // Only an invite is named here, so a 404 is an invite withdrawn, or answered in another tab
            if (error.code === "not-found" && form.has("inviteId")) {
                return { refusal: "That invite is no longer there." };
            }
            return { refusal: wordsFor(error.code) };
        }
        throw error;
    }
}