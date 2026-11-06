import type { ActionFunctionArgs } from "react-router";
import { api, ApiError } from "../api/client";
import { wordsFor } from "../api/words";

// The task page's action. Each form on the page sends one field, and the field's name says which of
// the API's endpoints to ask, one per field. After it the router reloads the project's data, so the
// list and the page show the change. A refusal goes back to the page in Taskco's words; a 401 does
// too, but the reload after it is refused as well, and the root's error page sends that to /login
export async function updateTaskAction({ request, params }: ActionFunctionArgs) {
    const form = await request.formData();

    try {
        if (form.has("status")) {
            await api<void>("PUT", `/tasks/${params.taskId}/status`, { status: form.get("status") });
        }
        return null;
    } catch (error) {
        if (error instanceof ApiError) {
            return { refusal: wordsFor(error.code) };
        }
        throw error;
    }
}
