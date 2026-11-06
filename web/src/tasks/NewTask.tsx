import { useState, type SubmitEvent } from "react";
import { Form, useActionData } from "react-router";
import type { projectAction } from "../projects/projectAction";

// "New task", for the Lead: a title, and a due date if wanted. A copy of NewProject: a blank title
// stops in the browser, any other is sent and the form closes, and focus follows it
export function NewTask() {
    const [open, setOpen] = useState(false);
    const [title, setTitle] = useState("");
    const [refusal, setRefusal] = useState<string | null>(null);
    const [wasOpen, setWasOpen] = useState(false);
    // What the project page's action last answered. The form has closed by then, so a refusal shows by the button
    const answer = useActionData<typeof projectAction>();

    function create(event: SubmitEvent<HTMLFormElement>) {
        if (title.trim() === "") {
            event.preventDefault();
            setRefusal("Give the task a title");
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
            <div>
                <button type="button" onClick={() => setOpen(true)} autoFocus={wasOpen}>
                    New task
                </button>
                {answer?.refusal && <p role="alert">{answer.refusal}</p>}
            </div>
        );
    }

    return (
        <Form method="post" onSubmit={create}>
            <label>
                Title
                <input name="title" autoFocus value={title} onChange={(event) => setTitle(event.target.value)} />
            </label>
            <label>
                Due date
                <input type="date" name="dueDate" />
            </label>
            {refusal && <p role="alert">{refusal}</p>}
            <button type="submit">Create</button>
            <button type="button" onClick={close}>
                Cancel
            </button>
        </Form>
    );
}
