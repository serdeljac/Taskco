import type { ActionFunctionArgs } from "react-router";
import { api, ApiError } from "../api/client";
import { wordsFor } from "../api/words";

// /account's action. Handing a project over keeps the asker on as an Associate: the account may yet
// be kept. After it, the router reloads the list, and the project has left it. A refusal goes back
// to the row in Taskco's words
export async function accountAction({ request }: ActionFunctionArgs) {
    const form = await request.formData();

    try {
        await api<void>("POST", `/projects/${form.get("projectId")}/transfer`, {
            toUserId: form.get("toUserId"),
            outgoing: "stay",
        });
        return null;
    } catch (error) {
        if (error instanceof ApiError) {
            return { refusal: wordsFor(error.code) };
        }
        throw error;
    }
}