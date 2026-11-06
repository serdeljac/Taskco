import { useState } from "react";
import { useFetcher } from "react-router";
import styles from "./style/Delete.module.scss";

type Props = {
    // The button: "Delete task" or "Delete subtask"
    label: string;
    // What it asks first: "Delete Dig the beds? Its subtasks go with it."
    question: string;
};

// Deleting, for the Lead: a button that asks first. Delete sends the form with the method DELETE,
// through a fetcher, to the action of the page it is on, which deletes and goes up a page. Cancel
// puts the button back. While asking, Cancel holds the focus, so Enter does not delete; after it, the
// button takes the focus back. A refusal shows by the button
export function Delete({ label, question }: Props) {
    const fetcher = useFetcher<{ refusal?: string } | null>();
    const [asking, setAsking] = useState(false);
    const [wasAsking, setWasAsking] = useState(false);

    function stopAsking() {
        setAsking(false);
        setWasAsking(true);
    }

    if (!asking) {
        return (
            <div className={styles.delete}>
                <button type="button" onClick={() => setAsking(true)} autoFocus={wasAsking}>
                    {label}
                </button>
                {fetcher.data?.refusal && <p role="alert">{fetcher.data.refusal}</p>}
            </div>
        );
    }

    // React Router reads the form before React takes it off the page
    return (
        <fetcher.Form method="delete" onSubmit={stopAsking} className={styles.delete}>
            <p role="alert">{question}</p>
            <button type="submit">Delete</button>
            <button type="button" onClick={stopAsking} autoFocus>
                Cancel
            </button>
        </fetcher.Form>
    );
}
