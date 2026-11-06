import { Link, useFetcher, useParams, useRouteLoaderData } from "react-router";
import type { projectLoader } from "../projects/ProjectPage";
import { Rename } from "./Rename";
import type { updateTaskAction } from "./updateTask";
import { assigneeWords, dueDateWords, priorityWords, statusWords } from "./words";

// One task, under its project's list. Its data is the project page's, loaded already, so opening a
// task asks the server nothing. An id not in the list is said here, under the project
export function TaskPage() {
    const { taskId } = useParams();
    const page = useRouteLoaderData<typeof projectLoader>("project");
    const task = page?.tasks.find((task) => task.id === taskId);
    const fetcher = useFetcher<typeof updateTaskAction>();
    // One fetcher for each of the other fields, as for status, so each shows its own refusal
    const priorityFetcher = useFetcher<typeof updateTaskAction>();
    const dueDateFetcher = useFetcher<typeof updateTaskAction>();
    const assigneeFetcher = useFetcher<typeof updateTaskAction>();
    const notesFetcher = useFetcher<typeof updateTaskAction>();

    if (!page || !task) {
        return <p>There's no task here.</p>;
    }

    // Priority, due date and assignee are the Lead's. An Associate sees them as words
    const isLead = page.project.role === "lead";

    return (
        <section aria-labelledby="task-title">
            <h2 id="task-title">{task.title}</h2>
            {isLead && (
                <Rename key={task.id} field="title" label="Title" current={task.title} blankWords="Give the task a title" />
            )}
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
                <dd>
                    {isLead ? (
                        <priorityFetcher.Form method="put" key={task.id}>
                            <select
                                name="priority"
                                aria-label="Priority"
                                defaultValue={task.priority ?? ""}
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
                    {/* Saved with a button: a date box reports every digit of the year as it is typed */}
                    {isLead ? (
                        <dueDateFetcher.Form method="put" key={task.id}>
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
                        <assigneeFetcher.Form method="put" key={task.id}>
                            <select
                                name="membershipId"
                                aria-label="Assigned to"
                                defaultValue={task.assignee_membership_id ?? ""}
                                onChange={(event) => assigneeFetcher.submit(event.currentTarget.form)}
                            >
                                <option value="">{assigneeWords(null, page.members)}</option>
                                {page.members.map((member) => (
                                    <option key={member.membership_id} value={member.membership_id}>
                                        {member.email}
                                    </option>
                                ))}
                            </select>
                        </assigneeFetcher.Form>
                    ) : (
                        assigneeWords(task.assignee_membership_id, page.members)
                    )}
                    {assigneeFetcher.data?.refusal && <p role="alert">{assigneeFetcher.data.refusal}</p>}
                </dd>
                <dt>Notes</dt>
                <dd>
                    <notesFetcher.Form method="put" key={task.id}>
                        <textarea name="notes" aria-label="Notes" placeholder="No notes" defaultValue={task.notes ?? ""} />
                        <button type="submit">Save notes</button>
                    </notesFetcher.Form>
                    {notesFetcher.data?.refusal && <p role="alert">{notesFetcher.data.refusal}</p>}
                </dd>
            </dl>
            <Link to={`/projects/${page.project.id}`}>Close</Link>
        </section>
    );
}