import type { ActionFunctionArgs } from "react-router";
import { api, ApiError } from "../api/client";
import { wordsFor } from "../api/words";

// "Not set", "TBD" and "Nobody" arrive as an empty choice; the API's word for each is null
function emptyIsNull(value: FormDataEntryValue | null) {
    return value === "" ? null : value;
}

// The task page's action. Each form on the page sends one field, and the field's name says which of
// the API's endpoints to ask, one per field. After it the router reloads the project's data, so the
// list and the page show the change. A refusal goes back to the page in Taskco's words; a 401 does
// too, but the reload after it is refused as well, and the root's error page sends that to /login
export async function updateTaskAction({ request, params }: ActionFunctionArgs) {
    const form = await request.formData();
    const task = `/tasks/${params.taskId}`;

    try {
        if (form.has("status")) {
            await api<void>("PUT", `${task}/status`, { status: form.get("status") });
        } else if (form.has("priority")) {
            await api<void>("PUT", `${task}/priority`, { priority: emptyIsNull(form.get("priority")) });
        } else if (form.has("dueDate")) {
            await api<{ clearedSubtasks: number }>("PUT", `${task}/due-date`, { dueDate: emptyIsNull(form.get("dueDate")) });
        } else if (form.has("membershipId")) {
            await api<void>("PUT", `${task}/assignee`, { membershipId: emptyIsNull(form.get("membershipId")) });
        } else if (form.has("notes")) {
            // The API stores blank notes as empty
            await api<void>("PUT", `${task}/notes`, { notes: form.get("notes") });
        }
        return null;
    } catch (error) {
        if (error instanceof ApiError) {
            return { refusal: wordsFor(error.code) };
        }
        throw error;
    }
}
