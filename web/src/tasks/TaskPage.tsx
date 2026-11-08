import { Link, Outlet, useFetcher, useLoaderData, useParams, useRouteLoaderData, type LoaderFunctionArgs } from "react-router";
import { DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { api, ApiError } from "../api/client";
import type { Member, Subtask, Task } from "../api/types";
import type { projectLoader } from "../projects/ProjectPage";
import { Delete } from "./Delete";
import { Fields } from "./Fields";
import { NewSubtask } from "./NewSubtask";
import { inOrderSent, neighboursAfterDrop } from "./order";
import { Rename } from "./Rename";
import { SortableRow } from "./SortableRow";
import styles from "./style/TaskPage.module.scss";
import { assigneeWords, dragInstructions, dragWords, dueDateWords, priorityWords, statusWords } from "./words";

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
    const fetcher = useFetcher<{ refusal?: string } | null>();
    // The mouse picks a row up by its handle; so does the keyboard, and its arrows move it one row
    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    // While a move is on its way, the order being sent; otherwise the server's. So a refused move
    // goes back to its place when the page's data reloads
    const sending = fetcher.formData;
    const shown = sending
        ? inOrderSent(subtasks, sending.get("subtaskId"), sending.get("afterSubtaskId"), sending.get("beforeSubtaskId"))
        : subtasks;

    // A drop sends the subtask, and the subtasks now above and below it
    function dropSubtask({ active, over }: DragEndEvent) {
        if (!over || active.id === over.id) {
            return;
        }
        const ids = shown.map((subtask) => subtask.id);
        const { above, below } = neighboursAfterDrop(ids, String(active.id), String(over.id));
        fetcher.submit(
            { intent: "move-subtask", subtaskId: String(active.id), afterSubtaskId: above, beforeSubtaskId: below },
            { method: "put" }
        );
    }

    return (
        <section aria-labelledby="task-title" className={styles.task}>
            <h2 id="task-title">{task.title}</h2>
            {isLead && <Rename field="title" label="Title" current={task.title} blankWords="Give the task a title" />}
            <Fields item={task} members={members} isLead={isLead} />
            {/* Only the Lead deletes: the API refuses anyone else. Deleting is soft, so the subtasks
                are hidden with their task */}
            {isLead && (
                <Delete
                    label="Delete task"
                    question={`Delete ${task.title}?${subtasks.length > 0 ? " Its subtasks go with it." : ""}`}
                />
            )}

            <h3 id="subtasks">Subtasks</h3>
            {/* Only the Lead creates subtasks: the API refuses anyone else */}
            {isLead && <NewSubtask maxDate={task.due_date} />}
            {fetcher.data?.refusal && <p role="alert">{fetcher.data.refusal}</p>}
            {subtasks.length === 0 ? (
                <p>No subtasks yet</p>
            ) : isLead ? (
                <DndContext
                    sensors={sensors}
                    onDragEnd={dropSubtask}
                    accessibility={{
                        announcements: dragWords(shown),
                        screenReaderInstructions: { draggable: dragInstructions },
                    }}
                >
                    <SubtaskTable subtasks={shown} members={members} canMove />
                </DndContext>
            ) : (
                // The order is the Lead's: the API refuses anyone else's move, so there is nothing to drag
                <SubtaskTable subtasks={shown} members={members} canMove={false} />
            )}

            {/* The subtask opened from the list, if one is: /projects/7/tasks/3/subtasks/9 */}
            <Outlet />

            <Link to={`/projects/${projectId}`}>Close</Link>
        </section>
    );
}

// The task's subtasks, in the order given. The Lead's rows start with a handle to move them, inside
// the section's DndContext; an Associate's rows are the subtask alone
function SubtaskTable({ subtasks, members, canMove }: { subtasks: Subtask[]; members: Member[]; canMove: boolean }) {
    return (
        <table aria-labelledby="subtasks" className={styles.subtasks}>
            <thead>
                <tr>
                    {canMove && <th scope="col">Move</th>}
                    <th scope="col">Subtask</th>
                    <th scope="col">Status</th>
                    <th scope="col">Priority</th>
                    <th scope="col">Due</th>
                    <th scope="col">Assigned to</th>
                </tr>
            </thead>
            <tbody>
                {canMove ? (
                    <SortableContext items={subtasks.map((subtask) => subtask.id)}>
                        {subtasks.map((subtask) => (
                            <SortableRow key={subtask.id} id={subtask.id} title={subtask.title}>
                                <SubtaskCells subtask={subtask} members={members} />
                            </SortableRow>
                        ))}
                    </SortableContext>
                ) : (
                    subtasks.map((subtask) => (
                        <tr key={subtask.id}>
                            <SubtaskCells subtask={subtask} members={members} />
                        </tr>
                    ))
                )}
            </tbody>
        </table>
    );
}

// A subtask's title, which opens it, and its fields in words
function SubtaskCells({ subtask, members }: { subtask: Subtask; members: Member[] }) {
    return (
        <>
            <td>
                <Link to={`subtasks/${subtask.id}`}>{subtask.title}</Link>
            </td>
            <td>{statusWords(subtask.status)}</td>
            <td>{priorityWords(subtask.priority)}</td>
            <td>{dueDateWords(subtask.due_date)}</td>
            <td>{assigneeWords(subtask.assignee_membership_id, members)}</td>
        </>
    );
}
