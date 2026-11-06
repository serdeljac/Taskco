import { useState, type SubmitEvent } from "react";
import { Form, useActionData, useRouteLoaderData } from "react-router";
import type { accountLoader } from "../account/AccountLayout";
import styles from "./style/NewTask.module.scss";
import { todayIn } from "./today";
import type { updateTaskAction } from "./updateTask";

type Props = {
    // The task's due date: a subtask may not be due after it. null when the task has none
    maxDate: string | null;
};

// "New subtask", for the Lead: a copy of New task, sent to the task page's action as intent
// "new-subtask". The date box offers only the days from the account's today to the task's due date.
// The form has noValidate: the browser's own check of those limits would refuse in its words, and
// the server's refusal comes back in Taskco's
export function NewSubtask({ maxDate }: Props) {
    const account = useRouteLoaderData<typeof accountLoader>("account");
    const [open, setOpen] = useState(false);
    const [title, setTitle] = useState("");
    const [refusal, setRefusal] = useState<string | null>(null);
    const [wasOpen, setWasOpen] = useState(false);
    // What the task page's action last answered. The form has closed by then, so a refusal shows by the button
    const answer = useActionData<typeof updateTaskAction>();

    function create(event: SubmitEvent<HTMLFormElement>) {
        if (title.trim() === "") {
            event.preventDefault();
            setRefusal("Give the subtask a title");
        } else {
            close();
        }
    }

    // After Cancel, or once a title is sent: closed, with nothing kept for next time
    function close() {
        setOpen(false);
        setTitle("");
        setRefusal(null);
        setWasOpen(true);
    }

    if (!open) {
        return (
            <div className={styles.newTask}>
                <button type="button" onClick={() => setOpen(true)} autoFocus={wasOpen}>
                    New subtask
                </button>
                {answer && "refusal" in answer && <p role="alert">{answer.refusal}</p>}
            </div>
        );
    }

    return (
        <Form method="post" noValidate onSubmit={create} className={styles.newTask}>
            <input type="hidden" name="intent" value="new-subtask" />
            <label>
                Subtask title
                <input name="title" autoFocus value={title} onChange={(event) => setTitle(event.target.value)} />
            </label>
            <label>
                Subtask due date
                <input
                    type="date"
                    name="dueDate"
                    min={account ? todayIn(account.user.timezone) : undefined}
                    max={maxDate ?? undefined}
                />
            </label>
            {refusal && <p role="alert">{refusal}</p>}
            <button type="submit">Create subtask</button>
            <button type="button" onClick={close}>
                Cancel
            </button>
        </Form>
    );
}
