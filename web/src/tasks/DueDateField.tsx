import { useState } from "react";
import { useFetcher } from "react-router";

type Props = {
    // The date the server has, or null for "TBD"
    dueDate: string | null;
    // A subtask's due date may only be from the account's today to its task's due date
    limits?: { min?: string; max?: string };
};

// A task's or a subtask's due date, for the Lead: a date box and Save date, through a fetcher of its
// own, to the action of the page it is on. What is in the box is state — draft — so a typed date is
// kept after a refusal, ready to send again. Saved with a button: a date box reports every digit of
// the year as it is typed. noValidate: the browser's own check of the limits would refuse in its words
export function DueDateField({ dueDate, limits }: Props) {
    const fetcher = useFetcher<{ refusal?: string; confirm?: number } | null>();
    const [draft, setDraft] = useState(dueDate ?? "");
    // The server's date when the box last took it. When the server's date changes — saved here, or
    // cleared by its task's date moving — the box follows it, set while drawing rather than drawn
    // afresh, so the focus stays where it is. A refusal changes nothing there, so a typed date stays
    const [fromServer, setFromServer] = useState(dueDate);
    if (dueDate !== fromServer) {
        setFromServer(dueDate);
        setDraft(dueDate ?? "");
    }

    // Cancel: the box goes back to the date the server has, and the question goes away
    function cancel() {
        setDraft(dueDate ?? "");
        fetcher.reset();
    }

    return (
        <>
            <fetcher.Form method="put" noValidate>
                <input
                    type="date"
                    name="dueDate"
                    aria-label="Due date"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    min={limits?.min}
                    max={limits?.max}
                />
                <button type="submit">Save date</button>
                {fetcher.data?.confirm && (
                    <>
                        <p role="alert">
                            Moving the date to {draft} clears the due dates of {fetcher.data.confirm} subtasks.
                        </p>
                        <button type="submit" name="confirmed" value="yes">
                            Save anyway
                        </button>
                        <button type="button" onClick={cancel}>
                            Cancel
                        </button>
                    </>
                )}
            </fetcher.Form>
            {fetcher.data?.refusal && <p role="alert">{fetcher.data.refusal}</p>}
        </>
    );
}
