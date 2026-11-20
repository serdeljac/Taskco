import type { ActionFunctionArgs } from "react-router";
import { api, ApiError } from "../api/client";
import type { Routine } from "../api/types";
import { wordsFor } from "../api/words";

// /routines' action. Done and Undo say what they are with their intent, read first, and name their
// routine: today's completion is added, or taken away. Anything else is a new routine, its name as
// typed, the API trims it, and the days ticked, as numbers. After any of them, the router reloads
// the list, streaks too. A refusal goes back to the form in Taskco's words
export async function routinesAction({ request }: ActionFunctionArgs) {
    const form = await request.formData();
    const today = `/routines/${form.get("routineId")}/completions/today`;

    try {
        if (form.get("intent") === "done-today") {
            await api<{ doneOn: string }>("PUT", today);
            return null;
        }

        if (form.get("intent") === "undo-today") {
            await api<void>("DELETE", today);
            return null;
        }

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