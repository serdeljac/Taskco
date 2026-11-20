import { useState, type SubmitEvent } from "react";
import { useFetcher } from "react-router";
import styles from "./style/NewRoutine.module.scss";

const days = [
    { value: 1, name: "Mon" },
    { value: 2, name: "Tue" },
    { value: 3, name: "Wed" },
    { value: 4, name: "Thu" },
    { value: 5, name: "Fri" },
    { value: 6, name: "Sat" },
    { value: 7, name: "Sun" },
];

// A new routine: a name, and the days it is for, every day to start with. A blank name, or no day
// at all, stops here in Taskco's words; anything else goes through a fetcher to /routines' action.
// Once it is made the form starts afresh, since its key is the new routine's id
export function NewRoutine() {
    const fetcher = useFetcher<{ refusal?: string; created?: string } | null>();
    const [stopped, setStopped] = useState<string | null>(null);

    function create(event: SubmitEvent<HTMLFormElement>) {
        const form = new FormData(event.currentTarget);
        if (String(form.get("name")).trim() === "") {
            event.preventDefault();
            setStopped("Give the routine a name");
        } else if (form.getAll("weekdays").length === 0) {
            event.preventDefault();
            setStopped("Pick at least one day");
        } else {
            setStopped(null);
        }
    }

    const refusal = stopped ?? fetcher.data?.refusal;

    return (
        <fetcher.Form key={fetcher.data?.created ?? "none"} method="post" onSubmit={create} className={styles.newRoutine}>
            <h2>New routine</h2>
            <label>
                Name
                <input name="name" />
            </label>
            <fieldset>
                <legend>Days</legend>
                {days.map((day) => (
                    <label key={day.value}>
                        <input type="checkbox" name="weekdays" value={day.value} defaultChecked />
                        {day.name}
                    </label>
                ))}
            </fieldset>
            <button type="submit">Create routine</button>
            {refusal && <p role="alert">{refusal}</p>}
        </fetcher.Form>
    );
}