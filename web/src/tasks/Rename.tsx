import { useState, type SubmitEvent } from "react";
import { useFetcher } from "react-router";
import styles from "./Rename.module.scss";

type Props = {
    // The field the page's action reads: "title" for a task, "name" for a project
    field: "title" | "name";
    label: string;
    current: string;
    blankWords: string;
};

// Renaming, for the Lead: a text field and Save. A blank name stops in the browser; any other is
// sent through a fetcher to the action of the page it is on, and the page's data reloads. Keyed by
// what it renames, so it starts afresh for each task
export function Rename({ field, label, current, blankWords }: Props) {
    const fetcher = useFetcher<{ refusal: string } | null>();
    const [refusal, setRefusal] = useState<string | null>(null);

    function save(event: SubmitEvent<HTMLFormElement>) {
        const value = String(new FormData(event.currentTarget).get(field));
        if (value.trim() === "") {
            event.preventDefault();
            setRefusal(blankWords);
        } else {
            setRefusal(null);
        }
    }

    const shown = refusal ?? fetcher.data?.refusal;

    return (
        <fetcher.Form method="put" onSubmit={save} className={styles.rename}>
            <label>
                {label}
                <input name={field} defaultValue={current} />
            </label>
            <button type="submit">Save {label.toLowerCase()}</button>
            {shown && <p role="alert">{shown}</p>}
        </fetcher.Form>
    );
}
