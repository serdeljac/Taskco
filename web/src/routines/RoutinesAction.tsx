import type { ActionFunctionArgs } from "react-router";
import { api, ApiError } from "../api/client";
import type { Routine } from "../api/types";
import { wordsFor } from "../api/words";

// /routines' action: a new routine, its name as typed, the API trims it, and the days ticked, as
// numbers. After it, the router reloads the list. A refusal goes back to the form in Taskco's words
export async function routinesAction({ request }: ActionFunctionArgs) {
    const form = await request.formData();

    try {
        const { routine } = await api<{ routine: Routine }>("POST", "/routines", {
            name: form.get("name"),
            weekdays: form.getAll("weekdays").map(Number),
        });
        return { created: routine.id };
    } catch (error) {
        if (error instanceof ApiError) {
            return { refusal: wordsFor(error.code) };
        }
        throw error;
    }
}