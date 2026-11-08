import { useSortable } from "@dnd-kit/sortable";
import { Link } from "react-router";
import type { Member, Task } from "../api/types";
import { assigneeWords, dueDateWords, priorityWords, statusWords } from "../tasks/words";

// One task's row in the project's table, for the Lead. Only its handle listens for a drag, so a press
// on the title still opens the task
export function TaskRow({ task, members }: { task: Task; members: Member[] }) {
    const { attributes, listeners, setNodeRef, setActivatorNodeRef } = useSortable({ id: task.id });

    return (
        <tr ref={setNodeRef}>
            <td>
                <button
                    type="button"
                    ref={setActivatorNodeRef}
                    aria-label={`Move ${task.title}`}
                    {...attributes}
                    {...listeners}
                >
                    ⠿
                </button>
            </td>
            <TaskCells task={task} members={members} />
        </tr>
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