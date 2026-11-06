import { Link, Outlet, useLoaderData, useParams, useRouteLoaderData, type LoaderFunctionArgs } from "react-router";
import { api, ApiError } from "../api/client";
import type { Member, Subtask, Task } from "../api/types";
import type { projectLoader } from "../projects/ProjectPage";
import { Fields } from "./Fields";
import { NewSubtask } from "./NewSubtask";
import { Rename } from "./Rename";
import styles from "./TaskPage.module.scss";
import { assigneeWords, dueDateWords, priorityWords, statusWords } from "./words";

// The task's subtasks: the one thing about a task the project page does not hold. A task the server
// cannot find has none, and the page says there's no task here, as for any id not in the list
export async function taskLoader({ params }: LoaderFunctionArgs) {
    try {
        return await api<{ subtasks: Subtask[] }>("GET", `/tasks/${params.taskId}/subtasks`);
    } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
            return { subtasks: [] };
        }
        throw error;
    }
}

// One task, under its project's list. Its own data is the project page's, loaded already; only its
// subtasks are asked for. An id not in the list is said here, under the project
export function TaskPage() {
    const { taskId } = useParams();
    const page = useRouteLoaderData<typeof projectLoader>("project");
    const { subtasks } = useLoaderData<typeof taskLoader>();
    const task = page?.tasks.find((task) => task.id === taskId);

    if (!page || !task) {
        return <p>There's no task here.</p>;
    }

    // Keyed by the task: opening another task draws it afresh, its fields' fetchers too, so nothing
    // one task was told follows to the next
    return (
        <TaskSection
            key={task.id}
            task={task}
            members={page.members}
            subtasks={subtasks}
            projectId={page.project.id}
            isLead={page.project.role === "lead"}
        />
    );
}

type Props = {
    task: Task;
    members: Member[];
    subtasks: Subtask[];
    projectId: string;
    isLead: boolean;
};

function TaskSection({ task, members, subtasks, projectId, isLead }: Props) {
    return (
        <section aria-labelledby="task-title" className={styles.task}>
            <h2 id="task-title">{task.title}</h2>
            {isLead && <Rename field="title" label="Title" current={task.title} blankWords="Give the task a title" />}
            <Fields item={task} members={members} isLead={isLead} />

            <h3 id="subtasks">Subtasks</h3>
            {/* Only the Lead creates subtasks: the API refuses anyone else */}
            {isLead && <NewSubtask maxDate={task.due_date} />}
            {subtasks.length === 0 ? (
                <p>No subtasks yet</p>
            ) : (
                <table aria-labelledby="subtasks">
                    <thead>
                        <tr>
                            <th scope="col">Subtask</th>
                            <th scope="col">Status</th>
                            <th scope="col">Priority</th>
                            <th scope="col">Due</th>
                            <th scope="col">Assigned to</th>
                        </tr>
                    </thead>
                    <tbody>
                        {subtasks.map((subtask) => (
                            <tr key={subtask.id}>
                                <td>
                                    <Link to={`subtasks/${subtask.id}`}>{subtask.title}</Link>
                                </td>
                                <td>{statusWords(subtask.status)}</td>
                                <td>{priorityWords(subtask.priority)}</td>
                                <td>{dueDateWords(subtask.due_date)}</td>
                                <td>{assigneeWords(subtask.assignee_membership_id, members)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            {/* The subtask opened from the list, if one is: /projects/7/tasks/3/subtasks/9 */}
            <Outlet />

            <Link to={`/projects/${projectId}`}>Close</Link>
        </section>
    );
}
