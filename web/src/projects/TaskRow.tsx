import { useSortable } from "@dnd-kit/sortable";
import { Link } from "react-router";
import type { Member, Task } from "../api/types";
import { assigneeWords, dueDateWords, priorityWords, statusWords } from "../tasks/words";

// One task's row in the project's table. Only its handle listens for a drag, so a press on the
// title still opens the task
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
            <td>
                <Link to={`tasks/${task.id}`}>{task.title}</Link>
            </td>
            <td>{statusWords(task.status)}</td>
            <td>{priorityWords(task.priority)}</td>
            <td>{dueDateWords(task.due_date)}</td>
            <td>{assigneeWords(task.assignee_membership_id, members)}</td>
        </tr>
    );
}