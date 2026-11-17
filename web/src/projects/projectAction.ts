import { redirect, type ActionFunctionArgs } from "react-router";
import { api, ApiError } from "../api/client";
import type { Invite, Task } from "../api/types";
import { wordsFor } from "../api/words";

// The project page's action. A move says what it is with its intent, read first: the task, and the
// one or two tasks it now sits between. So does an invite, with the address it goes to. A name
// renames the project — the Lead's rename form sends one. Anything else is a new task: the title as
// typed, the API trims it, and the due date if one was chosen; a date input sends "" when empty, so
// then no date is sent at all. After any of them, the router reloads the project's data. A refusal
// goes back to the form in Taskco's words
export async function projectAction({ request, params }: ActionFunctionArgs) {
    const form = await request.formData();
    const project = `/projects/${params.projectId}`;

    try {
        if (form.get("intent") === "move-task") {
            // At the top of the list there is no task above, and at the bottom none below: only the
            // neighbours there are are sent
            const neighbours: { afterTaskId?: string; beforeTaskId?: string } = {};
            for (const name of ["afterTaskId", "beforeTaskId"] as const) {
                const id = form.get(name);
                if (typeof id === "string" && id !== "") {
                    neighbours[name] = id;
                }
            }
            await api<void>("PUT", `/tasks/${form.get("taskId")}/position`, neighbours);
            return null;
        }

        // Removing and leaving are the same request: the member to end. Whoever left has no page
        // here any more, so they go to their projects
        if (form.get("intent") === "remove-member" || form.get("intent") === "leave") {
            await api<void>("DELETE", `${project}/members/${form.get("userId")}`);
            return form.get("intent") === "leave" ? redirect("/") : null;
        }


        if (form.get("intent") === "invite") {
            // What comes back is the invite as stored, without the project's name: only its id and address are used
            const { invite } = await api<{ invite: Pick<Invite, "id" | "email"> }>("POST", `${project}/invites`, {
                email: form.get("email"),
            });
            return { invited: invite.email, inviteId: invite.id };
        }

        if (form.has("name")) {
            await api<void>("PUT", `${project}/name`, { name: form.get("name") });
            return null;
        }

        const dueDate = String(form.get("dueDate") ?? "");
        const { task } = await api<{ task: Task }>("POST", `${project}/tasks`, {
            title: form.get("title"),
            ...(dueDate === "" ? {} : { dueDate }),
        });
        return { task };
    } catch (error) {
        if (error instanceof ApiError) {
            // The only thing an invite's body holds is the address, so a body refused is an address refused
            if (error.code === "invalid-body" && form.get("intent") === "invite") {
                return { refusal: "That doesn't look like an email address." };
            }
            return { refusal: wordsFor(error.code) };
        }
        throw error;
    }
}