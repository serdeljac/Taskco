import { pool } from "./db.js";

export type User = {
    id: string;
    email: string;
    timezone: string;
    created_at: Date;
};

export type Project = {
    id: string;
    name: string;
    created_at: Date;
};

export type TaskStatus = "not_started" | "in_progress" | "on_hold" | "completed";

export type Priority = "low" | "med" | "high";

export type Task = {
    id: string;
    project_id: string;
    title: string;
    status: TaskStatus;
    priority: Priority | null;
    due_date: string | null;
    position: number;
    created_at: Date;
    deleted_at: Date | null;
};

export type Subtask = {
    id: string;
    task_id: string;
    title: string;
    status: TaskStatus;
    priority: Priority | null;
    due_date: string | null;
    position: number;
    created_at: Date;
    deleted_at: Date | null;
};

export type Role = "lead" | "associate";

export async function createUser(email: string, timezone: string): Promise<User> {

    const { rows } = await pool.query<User>(
        `
        insert into users (email, timezone)
        values ($1, $2)
        returning *
        `,
        [email, timezone]
    );

    const user = rows[0];

    if (!user) {
        throw new Error("createUser: the insert returned no row");
    }
    return user; 
}

export async function createProject(name: string, userId: string): Promise<Project> {
    const client = await pool.connect();

    try {
        await client.query("begin");

        const { rows } = await client.query<Project>(
            `insert into projects (name)
            values ($1)
             returning *`,
            [name]
        );

        const project = rows[0];
        if (!project) {
            throw new Error("createProject: the insert returned no row");
        }

        await client.query(
            `insert into memberships (user_id, project_id, role)
            values ($1, $2, 'lead')`,
            [userId, project.id]
        );

        await client.query("commit");
        return project;
    } catch (error) {
        await client.query("rollback");
        throw error;
    } finally {
        client.release();
    }
}

export async function addMember(member: {
    projectId: string;
    userId: string;
    role: Role;
}): Promise<void> {
    await pool.query(
        `insert into memberships (user_id, project_id, role)
        values ($1, $2, $3)`,
        [member.userId, member.projectId, member.role]
    );
}

export async function removeMember(member: { projectId: string; userId: string }): Promise<void> {

    const { rows } = await pool.query(
        `select role from memberships
        where project_id = $1
        and user_id = $2
        and ended_at is null`,
        [member.projectId, member.userId]
    );

    if (rows.length > 0 && rows[0].role === "lead") {
        throw new Error("Cannot remove the project's lead");
    }

    await pool.query(
        `update memberships
        set ended_at = now()
        where project_id = $1
        and user_id = $2
        and ended_at is null`,
        [member.projectId, member.userId]
    );

}

export async function listProjectsForUser(userId: string): Promise<Project[]> {
    const { rows } = await pool.query<Project>(
        `select p.*
        from projects p
        join memberships m on m.project_id = p.id
        where m.user_id = $1
        and m.ended_at is null
        order by p.created_at`,
        [userId]
    );
    return rows;
}

export async function createTask(task: {
    projectId: string;
    title: string;
    dueDate?: string;
}): Promise<Task> {
    const { rows } = await pool.query<Task>(
        `insert into tasks (project_id, title, due_date, position)
        values (
            $1,
            $2,
            $3,
            (select coalesce(max(position), 0) + 65536 from tasks where project_id = $1)
        )
        returning *`,
        [task.projectId, task.title, task.dueDate ?? null]
    );

    const created = rows[0];
    if (!created) {
        throw new Error("createTask: the insert returned no row");
    }
    return created;
}

export async function listTasks(filter: { projectId: string; userId: string }): Promise<Task[]> {
    const { rows } = await pool.query<Task>(
        `select t.*
        from visible_tasks t
        join memberships m on m.project_id = t.project_id
        where t.project_id = $1
        and m.user_id = $2
        and m.ended_at is null
        order by t.position, t.id`,
        [filter.projectId, filter.userId]
    );
    return rows;
}

export async function deleteTask(taskID: string): Promise<void> {
    await pool.query(
        `update tasks
        set deleted_at = now()
        where id = $1
        and deleted_at is null`,
        [taskID]
    );
}

export async function moveTask(move: {
    taskId: string;
    afterTaskId?: string;
    beforeTaskId?: string;
}): Promise<void> {
    const client = await pool.connect();

    try {
        await client.query("begin");

        const { rows } = await client.query<{ id: string; project_id: string; position: number }>(
            `select id, project_id, position
            from tasks
            where id = $1 or id = $2`,
            [move.afterTaskId ?? null, move.beforeTaskId ?? null]
        );

        const after = rows.find((row) => row.id === move.afterTaskId);
        const before = rows.find((row) => row.id === move.beforeTaskId);

        if ((move.afterTaskId && !after) || (move.beforeTaskId && !before)) {
            throw new Error("moveTask: a neighbour was not found");
        }

        const neighbour = after ?? before;

        if (!neighbour) {
            throw new Error("moveTask: give at least one neighbour");
        }

        let candidate: number;

        if (after && before) {
            candidate = Math.floor((after.position + before.position) / 2);
        } else if (before) {
            candidate = Math.floor(before.position / 2);
        } else {
            candidate = neighbour.position + 65536;
        }

        const hasRoom =
            candidate > 0 &&
            (!after || candidate > after.position) &&
            (!before || candidate < before.position);

        if (hasRoom) {
            await client.query(
                `update tasks
                set position = $1
                where id = $2`,
                [candidate, move.taskId]
            );
        } else {
            const ordered = await client.query<{ id: string }>(
                `select id
                from tasks
                where project_id = $1
                and id <> $2
                order by position, id`,
                [neighbour.project_id, move.taskId]
            );

            const ids = ordered.rows.map((row) => row.id);
            const afterIndex = move.afterTaskId ? ids.indexOf(move.afterTaskId) : -1;
            ids.splice(afterIndex + 1, 0, move.taskId);

            for (const [index, id] of ids.entries()) {
                await client.query(
                    `update tasks
                    set position = $1
                    where id = $2`,
                    [(index + 1) * 65536, id]
                );
            }
        }

        await client.query("commit");
    } catch (error) {
        await client.query("rollback");
        throw error;
    } finally {
        client.release();
    }
}

export async function createSubtask(subtask: {
    taskId: string;
    title: string;
    dueDate?: string;
}): Promise<Subtask> {
    const counted = await pool.query<{ count: number }>(
        `select count(*)::int as count
        from visible_subtasks
        where task_id = $1`,
        [subtask.taskId]
    );

    if (subtask.dueDate) {
        await refuseDueDateAfterParent(subtask.taskId, subtask.dueDate);
    }

    if ((counted.rows[0]?.count ?? 0) >= 50) {
        throw new Error("createSubtask: a task can have at most 50 subtasks");
    }

    const { rows } = await pool.query<Subtask>(
        `insert into subtasks (task_id, title, due_date, position)
        values (
            $1,
            $2,
            $3,
            (select coalesce(max(position), 0) + 65536 from subtasks where task_id = $1)
        )
        returning *`,
        [subtask.taskId, subtask.title, subtask.dueDate ?? null]
    );

    const created = rows[0];
    if (!created) {
        throw new Error("createSubtask: the insert returned no row");
    }
    return created;
}

export async function listSubtasks(filter: { taskId: string; userId: string }): Promise<Subtask[]> {
    const { rows } = await pool.query<Subtask>(
        `select s.*
        from visible_subtasks s
        join visible_tasks t on t.id = s.task_id
        join memberships m on m.project_id = t.project_id
        where s.task_id = $1
        and m.user_id = $2
        and m.ended_at is null
        order by s.position, s.id`,
        [filter.taskId, filter.userId]
    );
    return rows;
}

export async function setSubtaskDueDate(change: {
    subtaskId: string;
    dueDate: string | null;
}): Promise<void> {
    const { rows } = await pool.query<{ task_id: string }>(
        `select task_id
        from visible_subtasks
        where id = $1`,
        [change.subtaskId]
    );

    const parentTaskId = rows[0]?.task_id;

    if (!parentTaskId) {
        throw new Error("setSubtaskDueDate: subtask not found");
    }

    if (change.dueDate) {
        await refuseDueDateAfterParent(parentTaskId, change.dueDate);
    }

    await pool.query(
        `update subtasks
        set due_date = $1
        where id = $2`,
        [change.dueDate, change.subtaskId]
    );
}

export async function setTaskDueDate(change: {
    taskId: string;
    dueDate: string | null;
}): Promise<{ clearedSubtasks: number }> {
    const client = await pool.connect();

    try {
        await client.query("begin");

        await client.query(
            `update tasks
            set due_date = $1
            where id = $2`,
            [change.dueDate, change.taskId]
        );

        let clearedSubtasks = 0;

        if (change.dueDate) {
            const cleared = await client.query(
                `update subtasks
                set due_date = null
                where task_id = $1
                and due_date > $2`,
                [change.taskId, change.dueDate]
            );

            clearedSubtasks = cleared.rowCount ?? 0;
        }

        await client.query("commit");
        return { clearedSubtasks };
    } catch (error) {
        await client.query("rollback");
        throw error;
    } finally {
        client.release();
    }
}






async function refuseDueDateAfterParent(taskId: string, dueDate: string): Promise<void> {
    const { rows } = await pool.query<{ due_date: string | null }>(
        `select due_date
        from tasks
        where id = $1`,
        [taskId]
    );

    const parentDueDate = rows[0]?.due_date;

    if (parentDueDate && dueDate > parentDueDate) {
        throw new Error("a subtask cannot be due after its task");
    }
}