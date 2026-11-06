import { useFetcher } from "react-router";
import type { Member, Subtask, Task } from "../api/types";
import { assigneeWords, dueDateWords, priorityWords, statusWords } from "./words";

type Props = {
    // A task or a subtask: the same five fields, each saved through the action of the page it is on
    item: Task | Subtask;
    members: Member[];
    // Priority, due date and assignee are the Lead's. An Associate sees them as words
    isLead: boolean;
    // A subtask's due date may only be from the account's today to its task's due date
    dueDateLimits?: { min?: string; max?: string };
};

// A task's or a subtask's fields. Drawn afresh for each item by its page's key, fetchers and all, so
// nothing one item was told follows to the next
export function Fields({ item, members, isLead, dueDateLimits }: Props) {
    // One fetcher for each field, so each shows its own refusal
    const statusFetcher = useFetcher<{ refusal?: string } | null>();
    const priorityFetcher = useFetcher<{ refusal?: string } | null>();
    const dueDateFetcher = useFetcher<{ refusal?: string } | null>();
    const assigneeFetcher = useFetcher<{ refusal?: string } | null>();
    const notesFetcher = useFetcher<{ refusal?: string } | null>();

    // A choice shows what is being sent while it is on its way, and otherwise the item's own value.
    // So after a refusal, the page's reloaded data puts it back to what the server has
    const status = String(statusFetcher.formData?.get("status") ?? item.status);
    const priority = String(priorityFetcher.formData?.get("priority") ?? item.priority ?? "");
    const assignee = String(assigneeFetcher.formData?.get("membershipId") ?? item.assignee_membership_id ?? "");

    return (
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
                    priorityWords(item.priority)
                )}
                {priorityFetcher.data?.refusal && <p role="alert">{priorityFetcher.data.refusal}</p>}
            </dd>
            <dt>Due</dt>
            <dd>
                {/* Saved with a button: a date box reports every digit of the year as it is typed. A typed
                    date is kept after a refusal, like the login form's email, so it can be sent again.
                    noValidate: the browser's own check of the limits would refuse in its words */}
                {isLead ? (
                    <dueDateFetcher.Form method="put" noValidate>
                        <input
                            type="date"
                            name="dueDate"
                            aria-label="Due date"
                            defaultValue={item.due_date ?? ""}
                            min={dueDateLimits?.min}
                            max={dueDateLimits?.max}
                        />
                        <button type="submit">Save date</button>
                    </dueDateFetcher.Form>
                ) : (
                    dueDateWords(item.due_date)
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
                    assigneeWords(item.assignee_membership_id, members)
                )}
                {assigneeFetcher.data?.refusal && <p role="alert">{assigneeFetcher.data.refusal}</p>}
            </dd>
            <dt>Notes</dt>
            <dd>
                <notesFetcher.Form method="put">
                    <textarea name="notes" aria-label="Notes" placeholder="No notes" defaultValue={item.notes ?? ""} />
                    <button type="submit">Save notes</button>
                </notesFetcher.Form>
                {notesFetcher.data?.refusal && <p role="alert">{notesFetcher.data.refusal}</p>}
            </dd>
        </dl>
    );
}
