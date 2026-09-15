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
        `insert into tasks (project_id, title, due_date)
        values ($1, $2, $3)
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
        order by t.created_at, t.id`,
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