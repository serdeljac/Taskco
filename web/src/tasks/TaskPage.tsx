import { Link, useFetcher, useParams, useRouteLoaderData } from "react-router";
import type { projectLoader } from "../projects/ProjectPage";
import type { updateTaskAction } from "./updateTask";
import { assigneeWords, dueDateWords, priorityWords, statusWords } from "./words";

// One task, under its project's list. Its data is the project page's, loaded already, so opening a
// task asks the server nothing. An id not in the list is said here, under the project
export function TaskPage() {
    const { taskId } = useParams();
    const page = useRouteLoaderData<typeof projectLoader>("project");
    const task = page?.tasks.find((task) => task.id === taskId);
    const fetcher = useFetcher<typeof updateTaskAction>();

    if (!page || !task) {
        return <p>There's no task here.</p>;
    }

    return (
        <section aria-labelledby="task-title">
            <h2 id="task-title">{task.title}</h2>
            <dl>
                <dt>Status</dt>
                <dd>
                    <fetcher.Form method="put" key={task.id}>
                        <select
                            name="status"
                            aria-label="Status"
                            defaultValue={task.status}
                            onChange={(event) => fetcher.submit(event.currentTarget.form)}
                        >
                            <option value="not_started">{statusWords("not_started")}</option>
                            <option value="in_progress">{statusWords("in_progress")}</option>
                            <option value="on_hold">{statusWords("on_hold")}</option>
                            <option value="completed">{statusWords("completed")}</option>
                        </select>
                    </fetcher.Form>
                    {fetcher.data?.refusal && <p role="alert">{fetcher.data.refusal}</p>}
                </dd>
                <dt>Priority</dt>
                <dd>{priorityWords(task.priority)}</dd>
                <dt>Due</dt>
                <dd>{dueDateWords(task.due_date)}</dd>
                <dt>Assigned to</dt>
                <dd>{assigneeWords(task.assignee_membership_id, page.members)}</dd>
                <dt>Notes</dt>
                <dd>{task.notes ?? "No notes"}</dd>
            </dl>
            <Link to={`/projects/${page.project.id}`}>Close</Link>
        </section>
    );
}