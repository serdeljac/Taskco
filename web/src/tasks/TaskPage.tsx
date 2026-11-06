import { Link, useParams, useRouteLoaderData } from "react-router";
import type { projectLoader } from "../projects/ProjectPage";
import { assigneeWords, dueDateWords, priorityWords, statusWords } from "./words";

// One task, under its project's list. Its data is the project page's, loaded already, so opening a
// task asks the server nothing. An id not in the list is said here, under the project
export function TaskPage() {
    const { taskId } = useParams();
    const page = useRouteLoaderData<typeof projectLoader>("project");
    const task = page?.tasks.find((task) => task.id === taskId);

    if (!page || !task) {
        return <p>There's no task here.</p>;
    }

    return (
        <section aria-labelledby="task-title">
            <h2 id="task-title">{task.title}</h2>
            <dl>
                <dt>Status</dt>
                <dd>{statusWords(task.status)}</dd>
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
