import { redirect, type ActionFunctionArgs } from "react-router";
import { api, ApiError } from "../api/client";
import type { Subtask } from "../api/types";
import { wordsFor } from "../api/words";

// "Not set", "TBD" and "Nobody" arrive as an empty choice; the API's word for each is null
function emptyIsNull(value: FormDataEntryValue | null) {
    return value === "" ? null : value;
}

// One field of a task or a subtask, named by the form: each has an endpoint of its own under base,
// "/tasks/3" or "/subtasks/9"
async function changeField(form: FormData, base: string): Promise<void> {
    if (form.has("status")) {
        await api<void>("PUT", `${base}/status`, { status: form.get("status") });
    } else if (form.has("priority")) {
        await api<void>("PUT", `${base}/priority`, { priority: emptyIsNull(form.get("priority")) });
    } else if (form.has("dueDate")) {
        await api<unknown>("PUT", `${base}/due-date`, { dueDate: emptyIsNull(form.get("dueDate")) });
    } else if (form.has("membershipId")) {
        await api<void>("PUT", `${base}/assignee`, { membershipId: emptyIsNull(form.get("membershipId")) });
    } else if (form.has("title")) {
        // The Lead's rename; the API trims it
        await api<void>("PUT", `${base}/title`, { title: form.get("title") });
    } else if (form.has("notes")) {
        // The API stores blank notes as empty
        await api<void>("PUT", `${base}/notes`, { notes: form.get("notes") });
    }
}

// The subtask page's action: one field of the subtask, through its own endpoints, as for a task. A
// form sent with the method DELETE deletes the subtask, and the page goes up to its task
export async function updateSubtaskAction({ request, params }: ActionFunctionArgs) {
    const form = await request.formData();

    try {
        if (request.method === "DELETE") {
            await api<void>("DELETE", `/subtasks/${params.subtaskId}`);
            return redirect(`/projects/${params.projectId}/tasks/${params.taskId}`);
        }

        await changeField(form, `/subtasks/${params.subtaskId}`);
        return null;
    } catch (error) {
        if (error instanceof ApiError) {
            return { refusal: wordsFor(error.code) };
        }
        throw error;
    }
}

// The task page's action. Each form on the page sends one field, and the field's name says which of
// the API's endpoints to ask. New subtask sends a title too, so it says what it is with its intent,
// read first. A form sent with the method DELETE deletes the task, and the page goes up to its
// project. After it the router reloads the page's data, so the lists and the page show the change.
// A refusal goes back to the page in Taskco's words; a 401 does too, but the reload after it is
// refused as well, and the root's error page sends that to /login
export async function updateTaskAction({ request, params }: ActionFunctionArgs) {
    const form = await request.formData();
    const task = `/tasks/${params.taskId}`;

    try {
        if (request.method === "DELETE") {
            await api<void>("DELETE", task);
            return redirect(`/projects/${params.projectId}`);
        }

        if (form.get("intent") === "new-subtask") {
            // A date input sends "" when empty, so then no date is sent at all
            const dueDate = String(form.get("dueDate") ?? "");
            const { subtask } = await api<{ subtask: Subtask }>("POST", `${task}/subtasks`, {
                title: form.get("title"),
                ...(dueDate === "" ? {} : { dueDate }),
            });
            return { subtask };
        }

        // Before a task's due date moves, ask how many subtask dates the new one would clear. If any,
        // answer with the count instead of saving, so the page can ask; Save anyway sends confirmed
        const dueDate = form.get("dueDate");
        if (typeof dueDate === "string" && dueDate !== "" && !form.has("confirmed")) {
            const { clears } = await api<{ clears: number }>("GET", `${task}/due-date-clears?${new URLSearchParams({ dueDate })}`);
            if (clears > 0) {
                return { confirm: clears };
            }
        }

        await changeField(form, task);
        return null;
    } catch (error) {
        if (error instanceof ApiError) {
            return { refusal: wordsFor(error.code) };
        }
        throw error;
    }
}
