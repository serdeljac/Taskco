import { arrayMove } from "@dnd-kit/sortable";

// What a list's moves have in common, for tasks on the project page and subtasks on the task page

// Where a dropped row now sits: the rows above and below it in the new order. At the top there is none
// above, and at the bottom none below, so either can be empty, and an empty one is not sent
export function neighboursAfterDrop(ids: string[], movedId: string, overId: string) {
    const order = arrayMove(ids, ids.indexOf(movedId), ids.indexOf(overId));
    const at = order.indexOf(movedId);
    return { above: order[at - 1] ?? "", below: order[at + 1] ?? "" };
}

// The rows in the order a move asks for, from what the move sends: the moved row taken out, and put
// back after the row above it, or before the row below it at the top. A neighbour no longer in the
// list leaves the order as it was
export function inOrderSent<Row extends { id: string }>(
    rows: Row[],
    movedId: FormDataEntryValue | null,
    aboveId: FormDataEntryValue | null,
    belowId: FormDataEntryValue | null
): Row[] {
    const moved = rows.find((row) => row.id === movedId);
    const rest = rows.filter((row) => row !== moved);
    const neighbour = rest.findIndex((row) => row.id === (aboveId || belowId));
    if (!moved || neighbour === -1) {
        return rows;
    }
    const at = aboveId ? neighbour + 1 : neighbour;
    return [...rest.slice(0, at), moved, ...rest.slice(at)];
}
