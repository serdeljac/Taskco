import { useState } from "react";
import { useFetcher } from "react-router";
import styles from "./style/DeleteProject.module.scss";

// Deleting the project, for the Lead: a button that asks first, and offers two ways. In 30 days is
// the safety net, undone from the banner until then; now is gone at once. The button pressed sends
// its own intent, so the page's action knows which. Cancel puts the first button back
export function DeleteProject({ projectName }: { projectName: string }) {
    const fetcher = useFetcher<{ refusal?: string } | null>();
    const [asking, setAsking] = useState(false);

    function startAsking() {
        fetcher.reset();
        setAsking(true);
    }

    if (!asking) {
        return (
            <div className={styles.deleteProject}>
                <button type="button" onClick={startAsking}>
                    Delete project
                </button>
                {fetcher.data?.refusal && <p role="alert">{fetcher.data.refusal}</p>}
            </div>
        );
    }

    return (
        <fetcher.Form method="post" onSubmit={() => setAsking(false)} className={styles.deleteProject}>
            <p role="alert">
                Delete {projectName}? In 30 days it is gone, and until then you can undo it. Delete now, and it is gone at once.
            </p>
            <button type="submit" name="intent" value="delete-later">
                Delete in 30 days
            </button>
            <button type="submit" name="intent" value="delete-now">
                Delete now
            </button>
            <button type="button" onClick={() => setAsking(false)} autoFocus>
                Cancel
            </button>
        </fetcher.Form>
    );
}