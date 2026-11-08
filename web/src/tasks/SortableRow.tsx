import type { ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";

// A row the Lead can drag to a new place in its list: a task on the project page, or a subtask on the
// task page. It starts with a handle named for the row, and only the handle listens for a drag, so a
// press on the title still opens it. The row's own cells follow the handle
export function SortableRow({ id, title, children }: { id: string; title: string; children: ReactNode }) {
    const { attributes, listeners, setNodeRef, setActivatorNodeRef } = useSortable({ id });

    return (
        <tr ref={setNodeRef}>
            <td>
                <button type="button" ref={setActivatorNodeRef} aria-label={`Move ${title}`} {...attributes} {...listeners}>
                    ⠿
                </button>
            </td>
            {children}
        </tr>
    );
}
