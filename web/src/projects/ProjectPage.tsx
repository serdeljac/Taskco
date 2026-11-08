import { data, Link, Outlet, useFetcher, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { api } from "../api/client";
import type { Member, Project, Task } from "../api/types";
import { NewTask } from "../tasks/NewTask";
import { Rename } from "../tasks/Rename";
import styles from "./style/ProjectPage.module.scss";
import { DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { TaskRow } from "./TaskRow";
import { roleWords } from "../tasks/words";

export async function projectLoader({ params }: LoaderFunctionArgs) {
    const { projects } = await api<{ projects: Project[] }>("GET", "/projects");
    const project = projects.find((project) => project.id === params.projectId);
    if (!project) {
        throw data(null, { status: 404 });
    }

    // Both at once: neither needs the other's answer
    const [{ tasks }, { members }] = await Promise.all([
        api<{ tasks: Task[] }>("GET", `/projects/${project.id}/tasks`),
        api<{ members: Member[] }>("GET", `/projects/${project.id}/members`),
    ]);
    return { project, tasks, members };
}

export function ProjectPage() {
    const { project, tasks, members } = useLoaderData<typeof projectLoader>();
    const fetcher = useFetcher();
    // The mouse picks a row up by its handle; so does the keyboard, and its arrows move it one row
    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    // A drop sends the task, and the tasks now above and below it. At the top there is none above,
    // and at the bottom none below: an empty one is not sent
    function dropTask({ active, over }: DragEndEvent) {
        if (!over || active.id === over.id) {
            return;
        }
        const ids = tasks.map((task) => task.id);
        const order = arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
        const at = order.indexOf(String(active.id));
        fetcher.submit(
            { intent: "move-task", taskId: String(active.id), afterTaskId: order[at - 1] ?? "", beforeTaskId: order[at + 1] ?? "" },
            { method: "put" }
        );
    }

    return (
        <>
            <p>
                <Link to="/">All projects</Link>
            </p>
            <h1>{project.name}</h1>
            {project.role === "lead" && (
                <Rename key={project.id} field="name" label="Name" current={project.name} blankWords="Give the project a name" />
            )}

            <h2>Tasks</h2>
            {/* Only the Lead creates tasks: the API refuses anyone else */}
            {project.role === "lead" && <NewTask />}
            {tasks.length === 0 ? (
                <p>No tasks yet</p>
            ) : (
                <DndContext sensors={sensors} onDragEnd={dropTask}>
                    <table className={styles.tasks}>
                        <thead>
                            <tr>
                                <th scope="col">Move</th>
                                <th scope="col">Task</th>
                                <th scope="col">Status</th>
                                <th scope="col">Priority</th>
                                <th scope="col">Due</th>
                                <th scope="col">Assigned to</th>
                            </tr>
                        </thead>
                        <tbody>
                            <SortableContext items={tasks.map((task) => task.id)}>
                                {tasks.map((task) => (
                                    <TaskRow key={task.id} task={task} members={members} />
                                ))}
                            </SortableContext>
                        </tbody>
                    </table>
                </DndContext>
            )}

            {/* The task opened from the list, if one is: /projects/7/tasks/3 */}
            <Outlet />

            <h2 id="members">Members</h2>
            <ul aria-labelledby="members" className={styles.members}>
                {members.map((member) => (
                    <li key={member.membership_id}>
                        {member.email}, {roleWords(member.role)}
                    </li>
                ))}
            </ul>
        </>
    );
}