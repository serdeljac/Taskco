import type { ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// A row the Lead can drag to a new place in its list: a task on the project page, or a subtask on the
// task page. It starts with a handle named for the row, and only the handle listens for a drag, so a
// press on the title still opens it. The row's own cells follow the handle
export function SortableRow({ id, title, children }: { id: string; title: string; children: ReactNode }) {
    const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition } = useSortable({ id });

    // While a row is dragged, dnd-kit says how far each row has moved, and the row slides there.
    // Translate, not Transform: Transform would also stretch a row to the height of the one it is
    // over, and rows differ in height when a title wraps
    const style = { transform: CSS.Translate.toString(transform), transition };

    return (
        <tr ref={setNodeRef} style={style}>
            <td>
                <button type="button" ref={setActivatorNodeRef} aria-label={`Move ${title}`} {...attributes} {...listeners}>
                    ⠿
                </button>
            </td>
            {children}
        </tr>
    );
}