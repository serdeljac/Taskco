import { useState } from "react";
import { useFetcher } from "react-router";
import styles from "./style/Delete.module.scss";

type Props = {
    // The button: "Delete task" or "Delete subtask"
    label: string;
    // What it asks first: "Delete Dig the beds? Its subtasks go with it."
    question: string;
    // The word on the button that goes ahead, when it is not "Delete": "Remove", "Leave"
    confirm?: string;
    // What the first button is called aloud, when its label alone does not say: "Remove ana@example.com"
    spoken?: string;
    // Fields sent along, for an action that does more than one thing: an intent, an id
    fields?: Record<string, string>;
};

// Deleting, for the Lead: a button that asks first. Delete sends the form with the method DELETE,
// through a fetcher, to the action of the page it is on, which deletes and goes up a page. Cancel
// puts the button back. While asking, Cancel holds the focus, so Enter does not delete; after it, the
// button takes the focus back. A refusal shows by the button, until the question is asked again
export function Delete({ label, question, confirm = "Delete", spoken, fields = {} }: Props) {
    const fetcher = useFetcher<{ refusal?: string } | null>();
    const [asking, setAsking] = useState(false);
    const [wasAsking, setWasAsking] = useState(false);

    // A refusal is the fetcher's last answer, which stays until the next one; asking again lets it go
    function startAsking() {
        fetcher.reset();
        setAsking(true);
    }

    function stopAsking() {
        setAsking(false);
        setWasAsking(true);
    }

    if (!asking) {
        return (
            <div className={styles.delete}>
                    <button type="button" onClick={startAsking} autoFocus={wasAsking} aria-label={spoken}>
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
            {Object.entries(fields).map(([name, value]) => (
                <input key={name} type="hidden" name={name} value={value} />
            ))}
            <button type="submit">{confirm}</button>
            <button type="button" onClick={stopAsking} autoFocus>
                Cancel
            </button>
        </fetcher.Form>
    );
}
