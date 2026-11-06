import type { ActionFunctionArgs } from "react-router";
import { api, ApiError } from "../api/client";
import type { Task } from "../api/types";
import { wordsFor } from "../api/words";

// The project page's action: creates a task with the title sent, as typed — the API trims it — and
// the due date if one was chosen. A date input sends "" when empty, so then no date is sent at all.
// After it the router reloads the project's data, so the list shows the new task at the bottom
export async function createTaskAction({ request, params }: ActionFunctionArgs) {
    const form = await request.formData();
    const dueDate = String(form.get("dueDate") ?? "");

    try {
        const { task } = await api<{ task: Task }>("POST", `/projects/${params.projectId}/tasks`, {
            title: form.get("title"),
            ...(dueDate === "" ? {} : { dueDate }),
        });
        return { task };
    } catch (error) {
        if (error instanceof ApiError) {
            return { refusal: wordsFor(error.code) };
        }
        throw error;
    }
}
