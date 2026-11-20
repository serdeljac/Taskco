import { useLoaderData } from "react-router";
import { api } from "../api/client";
import type { Routine } from "../api/types";
import { daysWords, streakWords, todayWords } from "./words";
import styles from "./style/RoutinesPage.module.scss";
import { NewRoutine } from "./NewRoutine";

// The asker's routines, then each one's streak. The API counts a streak for one routine at a time, so
// there is one request per routine, all at once: fine for the handful a person keeps
export async function routinesLoader() {
    const { routines } = await api<{ routines: Routine[] }>("GET", "/routines");
    const streaks = await Promise.all(
        routines.map((routine) => api<{ streak: number }>("GET", `/routines/${routine.id}/streak`))
    );
    return { routines: routines.map((routine, i) => ({ ...routine, streak: streaks[i]?.streak ?? 0 })) };
}

// /routines: the asker's own habits, private to them, in the order they were made
export function RoutinesPage() {
    const { routines } = useLoaderData<typeof routinesLoader>();

    return (
        <>
            <h1>Routines</h1>
            {routines.length === 0 ? (
                <p>No routines yet</p>
            ) : (
                <ul className={styles.routines}>
                    {routines.map((routine) => (
                        <li key={routine.id}>
                            <strong>{routine.name}</strong>
                            <span>{daysWords(routine.weekdays)}</span>
                            <span>{todayWords(routine)}</span>
                            <span>{streakWords(routine.streak)}</span>
                        </li>
                    ))}
                </ul>
            )}
            <NewRoutine />
        </>
    );
}