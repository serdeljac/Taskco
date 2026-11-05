import {useState, type SubmitEvent} from 'react'
import {Form, useActionData} from 'react-router';
import type { createProjectAction } from "./createProject";
import styles from "./NewProject.module.scss";

type Props = {
    names: string[];
};

export function NewProject({ names }: Props) {
    const [open, setOpen] = useState(false);
    const [name, setName] = useState("");
    const [refusal, setRefusal] = useState<string | null>(null);
    // What /'s action last answered. The form has closed by then, so a refusal shows by the button
    const answer = useActionData<typeof createProjectAction>();
    
    // Whether the form has been open: New project takes the focus back only when it returns
    const [wasOpen, setWasOpen] = useState(false);

    // Create was pressed: a blank name stops here. Any other name is sent, and the form closes
    function create(event: SubmitEvent<HTMLFormElement>) {
        if (name.trim() === "") {
            event.preventDefault();
            setRefusal("Give the project a name");
        } else {
            close();
        }
    }

    // After Cancel, or once a name is sent: closed, with nothing kept for next time
    function close() {
        setOpen(false);
        setName("");
        setRefusal(null);
        setWasOpen(true);
    }

    if(!open) {
        return (
            <div className={styles.newProject}>
                <button type="button" onClick={() => setOpen(true)} autoFocus={wasOpen}>
                    New project
                </button>
                {answer?.refusal && <p role="alert">{answer.refusal}</p>}
            </div>
        )
    }

    // Worked out again on every draw: the list's own spelling of the name typed, if it is there
    const taken = names.find((listed) => listed.toLowerCase() === name.trim().toLowerCase());

    return (
        <Form method="post" onSubmit={create} className={styles.newProject}>
            <label>
                Name
                <input name="name" autoFocus value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            {taken && <p role="status">You already have a project called {taken}.</p>}
            {refusal && <p role="alert">{refusal}</p>}
            <button type="submit">Create</button>
            <button type="button" onClick={close}>
                Cancel
            </button>
        </Form>
    )
}