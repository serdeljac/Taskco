import {
    Link,
    useFetcher,
    useLoaderData,
    useParams,
    useRouteLoaderData,
    type LoaderFunctionArgs,
} from "react-router";
import { api, ApiError } from "../api/client";
import type { Member, Subtask, Task } from "../api/types";
import type { projectLoader } from "../projects/ProjectPage";
import { NewSubtask } from "./NewSubtask";
import { Rename } from "./Rename";
import styles from "./TaskPage.module.scss";
import type { updateTaskAction } from "./updateTask";
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

    // Keyed by the task: opening another task draws its fields afresh, their fetchers too, so
    // nothing one task was told follows to the next
    return (
        <TaskFields
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
    // Priority, due date and assignee are the Lead's. An Associate sees them as words
    isLead: boolean;
};

function TaskFields({ task, members, subtasks, projectId, isLead }: Props) {
    // One fetcher for each field, so each shows its own refusal
    const statusFetcher = useFetcher<typeof updateTaskAction>();
    const priorityFetcher = useFetcher<typeof updateTaskAction>();
    const dueDateFetcher = useFetcher<typeof updateTaskAction>();
    const assigneeFetcher = useFetcher<typeof updateTaskAction>();
    const notesFetcher = useFetcher<typeof updateTaskAction>();

    // A choice shows what is being sent while it is on its way, and otherwise the task's own value.
    // So after a refusal, the page's reloaded data puts it back to what the server has
    const status = String(statusFetcher.formData?.get("status") ?? task.status);
    const priority = String(priorityFetcher.formData?.get("priority") ?? task.priority ?? "");
    const assignee = String(assigneeFetcher.formData?.get("membershipId") ?? task.assignee_membership_id ?? "");

    return (
        <section aria-labelledby="task-title" className={styles.task}>
            <h2 id="task-title">{task.title}</h2>
            {isLead && <Rename field="title" label="Title" current={task.title} blankWords="Give the task a title" />}
            <dl>
                <dt>Status</dt>
                <dd>
                    <statusFetcher.Form method="put">
                        <select
                            name="status"
                            aria-label="Status"
                            value={status}
                            onChange={(event) => statusFetcher.submit(event.currentTarget.form)}
                        >
                            <option value="not_started">{statusWords("not_started")}</option>
                            <option value="in_progress">{statusWords("in_progress")}</option>
                            <option value="on_hold">{statusWords("on_hold")}</option>
                            <option value="completed">{statusWords("completed")}</option>
                        </select>
                    </statusFetcher.Form>
                    {statusFetcher.data?.refusal && <p role="alert">{statusFetcher.data.refusal}</p>}
                </dd>
                <dt>Priority</dt>
                <dd>
                    {isLead ? (
                        <priorityFetcher.Form method="put">
                            <select
                                name="priority"
                                aria-label="Priority"
                                value={priority}
                                onChange={(event) => priorityFetcher.submit(event.currentTarget.form)}
                            >
                                <option value="">{priorityWords(null)}</option>
                                <option value="low">{priorityWords("low")}</option>
                                <option value="med">{priorityWords("med")}</option>
                                <option value="high">{priorityWords("high")}</option>
                            </select>
                        </priorityFetcher.Form>
                    ) : (
                        priorityWords(task.priority)
                    )}
                    {priorityFetcher.data?.refusal && <p role="alert">{priorityFetcher.data.refusal}</p>}
                </dd>
                <dt>Due</dt>
                <dd>
                    {/* Saved with a button: a date box reports every digit of the year as it is typed.
                        A typed date is kept after a refusal, like the login form's email, so it can be sent again */}
                    {isLead ? (
                        <dueDateFetcher.Form method="put">
                            <input type="date" name="dueDate" aria-label="Due date" defaultValue={task.due_date ?? ""} />
                            <button type="submit">Save date</button>
                        </dueDateFetcher.Form>
                    ) : (
                        dueDateWords(task.due_date)
                    )}
                    {dueDateFetcher.data?.refusal && <p role="alert">{dueDateFetcher.data.refusal}</p>}
                </dd>
                <dt>Assigned to</dt>
                <dd>
                    {isLead ? (
                        <assigneeFetcher.Form method="put">
                            <select
                                name="membershipId"
                                aria-label="Assigned to"
                                value={assignee}
                                onChange={(event) => assigneeFetcher.submit(event.currentTarget.form)}
                            >
                                <option value="">{assigneeWords(null, members)}</option>
                                {members.map((member) => (
                                    <option key={member.membership_id} value={member.membership_id}>
                                        {member.email}
                                    </option>
                                ))}
                            </select>
                        </assigneeFetcher.Form>
                    ) : (
                        assigneeWords(task.assignee_membership_id, members)
                    )}
                    {assigneeFetcher.data?.refusal && <p role="alert">{assigneeFetcher.data.refusal}</p>}
                </dd>
                <dt>Notes</dt>
                <dd>
                    <notesFetcher.Form method="put">
                        <textarea name="notes" aria-label="Notes" placeholder="No notes" defaultValue={task.notes ?? ""} />
                        <button type="submit">Save notes</button>
                    </notesFetcher.Form>
                    {notesFetcher.data?.refusal && <p role="alert">{notesFetcher.data.refusal}</p>}
                </dd>
            </dl>
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

            <Link to={`/projects/${projectId}`}>Close</Link>
        </section>
    );
}
