import { Link } from "react-router";
import type { Member, Task } from "../api/types";
import { SortableRow } from "../tasks/SortableRow";
import { assigneeWords, dueDateWords, priorityWords, statusWords } from "../tasks/words";

// One task's row in the project's table, for the Lead: a handle to drag it by, then the task
export function TaskRow({ task, members }: { task: Task; members: Member[] }) {
    return (
        <SortableRow id={task.id} title={task.title}>
            <TaskCells task={task} members={members} />
        </SortableRow>
    );
}

// A task's title, which opens it, and its fields in words: the whole of an Associate's row, and the
// Lead's after the handle
export function TaskCells({ task, members }: { task: Task; members: Member[] }) {
    return (
        <>
            <td>
                <Link to={`tasks/${task.id}`}>{task.title}</Link>
            </td>
            <td>{statusWords(task.status)}</td>
            <td>{priorityWords(task.priority)}</td>
            <td>{dueDateWords(task.due_date)}</td>
            <td>{assigneeWords(task.assignee_membership_id, members)}</td>
        </>
    );
}
