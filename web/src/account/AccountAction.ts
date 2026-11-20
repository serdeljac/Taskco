import { redirect, type ActionFunctionArgs } from "react-router";
import { api, ApiError } from "../api/client";
import { wordsFor } from "../api/words";

// /account's action. Deleting the account says so with its intent, read first: every session ends
// with it, so there is nothing left to show here, and the person goes to /login. Anything else hands
// a project over, keeping the asker on as an Associate: the account may yet be kept. After it, the
// router reloads the list, and the project has left it. A refusal goes back in Taskco's words
export async function accountAction({ request }: ActionFunctionArgs) {
    const form = await request.formData();

    try {
        if (form.get("intent") === "delete-account") {
            await api<{ scheduledFor: string }>("POST", "/account/deletion");
            return redirect("/login");
        }

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