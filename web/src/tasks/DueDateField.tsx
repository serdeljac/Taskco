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
    const fetcher = useFetcher<{ refusal?: string } | null>();
    const [draft, setDraft] = useState(dueDate ?? "");

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
            </fetcher.Form>
            {fetcher.data?.refusal && <p role="alert">{fetcher.data.refusal}</p>}
        </>
    );
}
