import { pool } from "./db.js";
import type { PoolClient } from "pg";
import { countStreak } from "./streak.js";

export type User = {
    id: string;
    email: string;
    timezone: string;
    created_at: Date;
    deletion_scheduled_at: Date | null;
};

export type Project = {
    id: string;
    name: string;
    created_at: Date;
    deletion_scheduled_at: Date | null;
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
    notes: string | null;
    position: number;
    created_at: Date;
    deleted_at: Date | null;
    assignee_membership_id: string | null;
};

export type Subtask = {
    id: string;
    task_id: string;
    title: string;
    status: TaskStatus;
    priority: Priority | null;
    due_date: string | null;
    notes: string | null;
    position: number;
    created_at: Date;
    deleted_at: Date | null;
    assignee_membership_id: string | null;
};

export type Role = "lead" | "associate";

export type Invite = {
    id: string;
    project_id: string;
    email: string;
    invited_by_user_id: string;
    created_at: Date;
    expires_at: Date;
};

export type Routine = {
    id: string;
    user_id: string;
    name: string;
    weekdays: number[];
    created_at: Date;
};

export type RoutineToday = Routine & {
    due_today: boolean;
    done_today: boolean;
};






/***********************************
    USERS
***********************************/

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

export async function deleteAccount(userId: string): Promise<{ scheduledFor: Date }> {
    const client = await pool.connect();

    try {
        await client.query("begin");

        const { rows } = await client.query<{ deletion_scheduled_at: Date }>(
            `update users
            set deletion_scheduled_at = now() + interval '30 days'
            where id = $1
            and deletion_scheduled_at is null
            returning deletion_scheduled_at`,
            [userId]
        );

        const scheduled = rows[0];
        if (!scheduled) {
            throw new Error("deleteAccount: account not found, or already being deleted");
        }

        await client.query(
            `update projects
            set deletion_scheduled_at = now() + interval '30 days'
            where deletion_scheduled_at is null
            and id in (
                select project_id from memberships
                where user_id = $1
                and role = 'lead'
                and ended_at is null
            )`,
            [userId]
        );

        const elsewhere = await client.query<{ project_id: string }>(
            `select project_id from memberships
            where user_id = $1
            and role = 'associate'
            and ended_at is null`,
            [userId]
        );

        for (const membership of elsewhere.rows) {
            await endMembership(client, { projectId: membership.project_id, userId });
        }

        await client.query("commit");
        return { scheduledFor: scheduled.deletion_scheduled_at };
    } catch (error) {
        await client.query("rollback");
        throw error;
    } finally {
        client.release();
    }
}

export async function reopenAccount(userId: string): Promise<void> {
    const client = await pool.connect();

    try {
        await client.query("begin");

        const reopened = await client.query(
            `update users
            set deletion_scheduled_at = null
            where id = $1
            and deletion_scheduled_at > now()`,
            [userId]
        );

        if (reopened.rowCount === 0) {
            throw new Error("reopenAccount: account not found, or not inside its deletion window");
        }

        await client.query(
            `update projects
            set deletion_scheduled_at = null
            where deletion_scheduled_at > now()
            and id in (
                select project_id from memberships
                where user_id = $1
                and role = 'lead'
                and ended_at is null
            )`,
            [userId]
        );

        await client.query("commit");
    } catch (error) {
        await client.query("rollback");
        throw error;
    } finally {
        client.release();
    }
}

export async function purgeDeletedAccounts(): Promise<{ purged: number }> {
    const { rows } = await pool.query<{ id: string }>(
        `delete from users u
        where u.deletion_scheduled_at <= now()
        and not exists (
            select 1 from memberships m
            where m.user_id = u.id
            and m.role = 'lead'
            and m.ended_at is null
        )
        returning u.id`
    );

    return { purged: rows.length };
}

/***********************************
    MEMBERS
***********************************/

export async function addMember(member: {
    projectId: string;
    userId: string;
    role: Role;
}): Promise<void> {
    const added = await pool.query(
        `insert into memberships (user_id, project_id, role)
        select $1, $2, $3
        where exists (
            select 1 from projects
            where id = $2
            and deletion_scheduled_at is null
        )`,
        [member.userId, member.projectId, member.role]
    );

    if (added.rowCount === 0) {
        throw new Error("addMember: project not found, or being deleted");
    }
}

export async function removeMember(member: { projectId: string; userId: string }): Promise<void> {
    const client = await pool.connect();

    try {
        await client.query("begin");

        await refuseIfProjectIsBeingDeleted(client, member.projectId);
        await endMembership(client, member);

        await client.query("commit");
    } catch (error) {
        await client.query("rollback");
        throw error;
    } finally {
        client.release();
    }
}

export async function transferLeadership(transfer: {
    projectId: string;
    toUserId: string;
    outgoing: "stay" | "leave";
}): Promise<void> {
    const client = await pool.connect();

    try {
        await client.query("begin");

        await refuseIfProjectIsBeingDeleted(client, transfer.projectId);

        const current = await client.query<{ id: string; user_id: string }>(
            `select id, user_id from memberships
            where project_id = $1
            and role = 'lead'
            and ended_at is null
            for update`,
            [transfer.projectId]
        );

        const lead = current.rows[0];

        if (!lead) {
            throw new Error("transferLeadership: project not found");
        }

        const next = await client.query<{ id: string; role: Role; leaving: boolean }>(
            `select m.id, m.role, u.deletion_scheduled_at is not null as leaving
            from memberships m
            join users u on u.id = m.user_id
            where m.project_id = $1
            and m.user_id = $2
            and m.ended_at is null
            for update of m`,
            [transfer.projectId, transfer.toUserId]
        );

        const recipient = next.rows[0];

        if (!recipient) {
            throw new Error("transferLeadership: the new Lead must be a current member of the project");
        }

        if (recipient.leaving) {
            throw new Error("transferLeadership: the new Lead's account is being deleted");
        }

        if (recipient.role === "lead") {
            throw new Error("transferLeadership: they already lead this project");
        }

        await client.query(
            `update memberships
            set role = 'associate'
            where id = $1`,
            [lead.id]
        );

        await client.query(
            `update memberships
            set role = 'lead'
            where id = $1`,
            [recipient.id]
        );

        if (transfer.outgoing === "leave") {
            await endMembership(client, { projectId: transfer.projectId, userId: lead.user_id });
        }

        await client.query("commit");
    } catch (error) {
        await client.query("rollback");
        throw error;
    } finally {
        client.release();
    }
}



/***********************************
    PROJECTS
***********************************/

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

export async function listProjectsForUser(userId: string): Promise<Project[]> {
    const { rows } = await pool.query<Project>(
        `select p.*
        from projects p
        join memberships m on m.project_id = p.id
        where m.user_id = $1
        and m.ended_at is null
        and (
            p.deletion_scheduled_at is null
            or (m.role = 'lead' and p.deletion_scheduled_at > now())
        )
        order by p.created_at, p.id`,
        [userId]
    );
    return rows;
}

export async function deleteProject(projectId: string): Promise<{ scheduledFor: Date }> {
    const { rows } = await pool.query<{ deletion_scheduled_at: Date }>(
        `update projects
        set deletion_scheduled_at = now() + interval '30 days'
        where id = $1
        and deletion_scheduled_at is null
        returning deletion_scheduled_at`,
        [projectId]
    );

    const scheduled = rows[0];
    if (!scheduled) {
        throw new Error("deleteProject: project not found, or already being deleted");
    }

    return { scheduledFor: scheduled.deletion_scheduled_at };
}

export async function restoreProject(projectId: string): Promise<void> {
    const restored = await pool.query(
        `update projects
        set deletion_scheduled_at = null
        where id = $1
        and deletion_scheduled_at > now()
        and not exists (
            select 1 from memberships m
            join users u on u.id = m.user_id
            where m.project_id = projects.id
            and m.role = 'lead'
            and m.ended_at is null
            and u.deletion_scheduled_at is not null
        )`,
        [projectId]
    );

    if (restored.rowCount === 0) {
        throw new Error(
            "restoreProject: project not found, not inside its deletion window, or its Lead's account is being deleted"
        );
    }
}

export async function deleteProjectNow(projectId: string): Promise<void> {
    const deleted = await pool.query(
        `delete from projects
        where id = $1
        and deletion_scheduled_at is null`,
        [projectId]
    );

    if (deleted.rowCount === 0) {
        throw new Error("deleteProjectNow: project not found, or already being deleted");
    }
}

export async function purgeDeletedProjects(): Promise<{ purged: number }> {
    const { rows } = await pool.query<{ id: string }>(
        `delete from projects
        where deletion_scheduled_at <= now()
        returning id`
    );

    return { purged: rows.length };
}


/***********************************
    TASKS
***********************************/

export async function createTask(task: {
    projectId: string;
    title: string;
    dueDate?: string;
}): Promise<Task> {

    const client = await pool.connect();

    try {
        await client.query("begin");

        await refuseIfProjectIsBeingDeleted(client, task.projectId);

        const highest = await client.query<{ highest: number }>(
            `select coalesce(max(position), 0) as highest
            from tasks
            where project_id = $1`,
            [task.projectId]
        );

        if ((highest.rows[0]?.highest ?? 0) + 65536 > 2147483647) {
            const ordered = await client.query<{ id: string }>(
                `select id
                from tasks
                where project_id = $1
                order by position, id`,
                [task.projectId]
            );

            await renumberTasks(client, ordered.rows.map((row) => row.id));
        }

        const { rows } = await client.query<Task>(
            `insert into tasks (project_id, title, due_date, position, assignee_membership_id)
            values (
            $1,
            $2,
            $3,
            (select coalesce(max(position), 0) + 65536 from tasks where project_id = $1),
            (select id from memberships
                where project_id = $1
                and role = 'lead'
                and ended_at is null)
            )
            returning *`,
            [task.projectId, task.title, task.dueDate ?? null]
        );

        const created = rows[0];
        if (!created) {
            throw new Error("createTask: the insert returned no row");
        }

        await client.query("commit");
        return created;
    } catch (error) {
        await client.query("rollback");
        throw error;
    } finally {
        client.release();
    }
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

export async function setTaskDueDate(change: {
    taskId: string;
    dueDate: string | null;
}): Promise<{ clearedSubtasks: number }> {
    const client = await pool.connect();

    try {
        await client.query("begin");

        const updated = await client.query(
            `update tasks
            set due_date = $1
            where id in (select id from visible_tasks where id = $2)`,
            [change.dueDate, change.taskId]
        );

        if (updated.rowCount === 0) {
            throw new Error("setTaskDueDate: task not found");
        }

        let clearedSubtasks = 0;

        if (change.dueDate) {
            const cleared = await client.query<{ deleted_at: Date | null }>(
                `update subtasks
                set due_date = null
                where task_id = $1
                and due_date > $2
                returning deleted_at`,
                [change.taskId, change.dueDate]
            );

            clearedSubtasks = cleared.rows.filter((row) => row.deleted_at === null).length;
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

export async function setTaskNotes(change: {
    taskId: string;
    notes: string | null;
}): Promise<void> {
    const notes = change.notes?.trim() || null;

    const updated = await pool.query(
        `update tasks
        set notes = $1
        where id in (select id from visible_tasks where id = $2)`,
        [notes, change.taskId]
    );

    if (updated.rowCount === 0) {
        throw new Error("setTaskNotes: task not found");
    }
}

export async function deleteTask(taskID: string): Promise<void> {
    const deleted = await pool.query(
        `update tasks
        set deleted_at = now()
        where id in (select id from visible_tasks where id = $1)`,
        [taskID]
    );

    if (deleted.rowCount === 0) {
        throw new Error("deleteTask: task not found");
    }
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
            from visible_tasks
            where id = $1 or id = $2 or id = $3`,
            [move.taskId, move.afterTaskId ?? null, move.beforeTaskId ?? null]
        );

        const moved = rows.find((row) => row.id === move.taskId);
        const after = rows.find((row) => row.id === move.afterTaskId);
        const before = rows.find((row) => row.id === move.beforeTaskId);

        if (!moved) {
            throw new Error("moveTask: task not found");
        }

        if ((move.afterTaskId && !after) || (move.beforeTaskId && !before)) {
            throw new Error("moveTask: a neighbour was not found");
        }

        const neighbour = after ?? before;

        if (!neighbour) {
            throw new Error("moveTask: give at least one neighbour");
        }

        if (
            (after && after.project_id !== moved.project_id) ||
            (before && before.project_id !== moved.project_id)
        ) {
            throw new Error("moveTask: the task and its neighbours must be in the same project");
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
            candidate <= 2147483647 &&
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
                [moved.project_id, move.taskId]
            );

            const ids = ordered.rows.map((row) => row.id);
            const afterIndex = move.afterTaskId ? ids.indexOf(move.afterTaskId) : -1;
            ids.splice(afterIndex + 1, 0, move.taskId);

            await renumberTasks(client, ids);
        }

        await client.query("commit");
    } catch (error) {
        await client.query("rollback");
        throw error;
    } finally {
        client.release();
    }
}

export async function setTaskAssignee(change: {
    taskId: string;
    membershipId: string | null;
}): Promise<void> {
    const client = await pool.connect();

    try {
        await client.query("begin");

        const task = await client.query<{ project_id: string }>(
            `select project_id
            from visible_tasks
            where id = $1`,
            [change.taskId]
        );

        const projectId = task.rows[0]?.project_id;

        if (!projectId) {
            throw new Error("setTaskAssignee: task not found");
        }

        if (change.membershipId !== null) {
            await refuseUnlessCurrentMember(client, change.membershipId, projectId);
        }

        await client.query(
            `update tasks
            set assignee_membership_id = $1
            where id = $2`,
            [change.membershipId, change.taskId]
        );

        await client.query("commit");
    } catch (error) {
        await client.query("rollback");
        throw error;
    } finally {
        client.release();
    }
}

/***********************************
    SUBTASKS
***********************************/

export async function createSubtask(subtask: {
    taskId: string;
    title: string;
    dueDate?: string;
}): Promise<Subtask> {
    
    const parent = await pool.query<{ id: string; assignee_membership_id: string | null }>(
        `select id, assignee_membership_id
        from visible_tasks
        where id = $1`,
        [subtask.taskId]
    );

    const parentTask = parent.rows[0];

    if (!parentTask) {
        throw new Error("createSubtask: task not found");
    }

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
        `insert into subtasks (task_id, title, due_date, position, assignee_membership_id)
        values (
            $1,
            $2,
            $3,
            (select coalesce(max(position), 0) + 65536 from subtasks where task_id = $1),
            $4
        )
        returning *`,
        [subtask.taskId, subtask.title, subtask.dueDate ?? null, parentTask.assignee_membership_id]
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

export async function setSubtaskNotes(change: {
    subtaskId: string;
    notes: string | null;
}): Promise<void> {
    const notes = change.notes?.trim() || null;

    const updated = await pool.query(
        `update subtasks
        set notes = $1
        where id = $2
        and deleted_at is null
        and task_id in (select id from visible_tasks)`,
        [notes, change.subtaskId]
    );

    if (updated.rowCount === 0) {
        throw new Error("setSubtaskNotes: subtask not found");
    }
}

export async function setSubtaskDueDate(change: {
    subtaskId: string;
    dueDate: string | null;
}): Promise<void> {
    const { rows } = await pool.query<{ task_id: string }>(
        `select s.task_id
        from visible_subtasks s
        join visible_tasks t on t.id = s.task_id
        where s.id = $1`,
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

export async function setSubtaskAssignee(change: {
    subtaskId: string;
    membershipId: string | null;
}): Promise<void> {
    const client = await pool.connect();

    try {
        await client.query("begin");

        const parent = await client.query<{ project_id: string }>(
            `select t.project_id
            from visible_subtasks s
            join visible_tasks t on t.id = s.task_id
            where s.id = $1`,
            [change.subtaskId]
        );

        const parentProjectId = parent.rows[0]?.project_id;

        if (!parentProjectId) {
            throw new Error("setSubtaskAssignee: subtask not found");
        }

        if (change.membershipId !== null) {
            await refuseUnlessCurrentMember(client, change.membershipId, parentProjectId);
        }

        await client.query(
            `update subtasks
            set assignee_membership_id = $1
            where id = $2`,
            [change.membershipId, change.subtaskId]
        );

        await client.query("commit");
    } catch (error) {
        await client.query("rollback");
        throw error;
    } finally {
        client.release();
    }
}


/***********************************
    INVITES
***********************************/

export async function createInvite(invite: {
    projectId: string;
    email: string;
    invitedByUserId: string;
}): Promise<Invite> {
    const client = await pool.connect();

    try {
        await client.query("begin");

        await refuseIfProjectIsBeingDeleted(client, invite.projectId);

        const recipient = await client.query<{ id: string }>(
            `select id from users
            where lower(email) = lower($1)`,
            [invite.email]
        );

        const recipientId = recipient.rows[0]?.id;

        if (!recipientId) {
            throw new Error("No email found");
        }

        const member = await client.query<{ id: string }>(
            `select id from memberships
            where project_id = $1
            and user_id = $2
            and ended_at is null`,
            [invite.projectId, recipientId]
        );

        if (member.rows.length > 0) {
            throw new Error("createInvite: they are already a member of this project");
        }

        await client.query(
            `delete from invites
            where project_id = $1
            and lower(email) = lower($2)`,
            [invite.projectId, invite.email]
        );

        const { rows } = await client.query<Invite>(
            `insert into invites (project_id, email, invited_by_user_id, expires_at)
            values ($1, $2, $3, now() + interval '3 days')
            returning *`,
            [invite.projectId, invite.email, invite.invitedByUserId]
        );

        const created = rows[0];
        if (!created) {
            throw new Error("createInvite: the insert returned no row");
        }

        await client.query("commit");
        return created;
    } catch (error) {
        await client.query("rollback");
        throw error;
    } finally {
        client.release();
    }
}

export async function acceptInvite(accept: {
    inviteId: string;
    userId: string;
}): Promise<{ projectId: string }> {
    const client = await pool.connect();

    try {
        await client.query("begin");

        const found = await client.query<{ project_id: string; expired: boolean }>(
            `select i.project_id, i.expires_at <= now() as expired
            from invites i
            join users u on lower(u.email) = lower(i.email)
            where i.id = $1
            and u.id = $2
            for update of i`,
            [accept.inviteId, accept.userId]
        );

        const invite = found.rows[0];

        if (!invite) {
            throw new Error("acceptInvite: invite not found");
        }

        if (invite.expired) {
            throw new Error("acceptInvite: this invite has expired");
        }

        await refuseIfProjectIsBeingDeleted(client, invite.project_id);

        const member = await client.query<{ id: string }>(
            `select id from memberships
            where project_id = $1
            and user_id = $2
            and ended_at is null`,
            [invite.project_id, accept.userId]
        );

        if (member.rows.length > 0) {
            throw new Error("acceptInvite: you are already a member of this project");
        }

        await client.query(
            `insert into memberships (user_id, project_id, role)
            values ($1, $2, 'associate')`,
            [accept.userId, invite.project_id]
        );

        await client.query(`delete from invites where id = $1`, [accept.inviteId]);

        await client.query("commit");
        return { projectId: invite.project_id };
    } catch (error) {
        await client.query("rollback");
        throw error;
    } finally {
        client.release();
    }
}

export async function declineInvite(decline: {
    inviteId: string;
    userId: string;
}): Promise<void> {
    const deleted = await pool.query(
        `delete from invites
        where id = $1
        and lower(email) = (select lower(email) from users where id = $2)`,
        [decline.inviteId, decline.userId]
    );

    if (deleted.rowCount === 0) {
        throw new Error("declineInvite: invite not found");
    }
}

export async function listInvitesForUser(userId: string): Promise<Invite[]> {
    const { rows } = await pool.query<Invite>(
        `select i.*
        from invites i
        join users u on lower(u.email) = lower(i.email)
        where u.id = $1
        and i.expires_at > now()
        order by i.created_at, i.id`,
        [userId]
    );
    return rows;
}





/***********************************
    ROUTINES
***********************************/

export async function createRoutine(routine: {
    userId: string;
    name: string;
    weekdays: number[];
}): Promise<Routine> {
    const { rows } = await pool.query<Routine>(
        `insert into routines (user_id, name, weekdays)
        values ($1, $2, $3)
        returning *`,
        [routine.userId, routine.name, routine.weekdays]
    );

    const created = rows[0];
    if (!created) {
        throw new Error("createRoutine: the insert returned no row");
    }
    return created;
}

export async function listRoutines(userId: string): Promise<RoutineToday[]> {
    const { rows } = await pool.query<RoutineToday>(
        `select r.*,
            extract(isodow from t.today) = any(r.weekdays) as due_today,
            exists (
                select 1 from completions c
                where c.routine_id = r.id
                and c.done_on = t.today
            ) as done_today
        from routines r
        join user_today t on t.user_id = r.user_id
        where r.user_id = $1
        order by r.created_at, r.id`,
        [userId]
    );
    return rows;
}

export async function completeRoutine(complete: {
    routineId: string;
    userId: string;
}): Promise<{ doneOn: string }> {
    const found = await pool.query<{ today: string }>(
        `select t.today
        from routines r
        join user_today t on t.user_id = r.user_id
        where r.id = $1
        and r.user_id = $2`,
        [complete.routineId, complete.userId]
    );

    const today = found.rows[0]?.today;

    if (!today) {
        throw new Error("completeRoutine: routine not found");
    }

    await pool.query(
        `insert into completions (routine_id, done_on)
        values ($1, $2)
        on conflict (routine_id, done_on) do nothing`,
        [complete.routineId, today]
    );

    return { doneOn: today };
}

export async function undoCompletion(undo: {
    routineId: string;
    userId: string;
}): Promise<void> {
    const deleted = await pool.query(
        `delete from completions
        where routine_id in (select id from routines where id = $1 and user_id = $2)
        and done_on = (select today from user_today where user_id = $2)`,
        [undo.routineId, undo.userId]
    );

    if (deleted.rowCount === 0) {
        throw new Error("undoCompletion: not completed today");
    }
}

export async function getStreak(ask: {
    routineId: string;
    userId: string;
}): Promise<number> {
    const found = await pool.query<{ today: string; started: string; weekdays: number[] }>(
        `select t.today, (r.created_at at time zone u.timezone)::date as started, r.weekdays
        from routines r
        join users u on u.id = r.user_id
        join user_today t on t.user_id = r.user_id
        where r.id = $1
        and r.user_id = $2`,
        [ask.routineId, ask.userId]
    );

    const routine = found.rows[0];

    if (!routine) {
        throw new Error("getStreak: routine not found");
    }

    const log = await pool.query<{ done_on: string }>(
        `select done_on from completions where routine_id = $1`,
        [ask.routineId]
    );

    return countStreak({
        today: routine.today,
        started: routine.started,
        weekdays: routine.weekdays,
        doneOn: log.rows.map((row) => row.done_on),
    });
}











/***********************************
    HELPER FUNCTIONS
***********************************/

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

async function renumberTasks(client: PoolClient, ids: string[]): Promise<void> {
    for (const [index, id] of ids.entries()) {
        await client.query(
            `update tasks
            set position = $1
            where id = $2`,
            [(index + 1) * 65536, id]
        );
    }
}

async function refuseUnlessCurrentMember(
    client: PoolClient,
    membershipId: string,
    projectId: string
): Promise<void> {
    const { rows } = await client.query<{ id: string }>(
        `select id from memberships
        where id = $1
        and project_id = $2
        and ended_at is null
        for update`,
        [membershipId, projectId]
    );

    if (rows.length === 0) {
        throw new Error("the assignee must be a current member of the project");
    }
}

async function refuseIfProjectIsBeingDeleted(
    client: PoolClient,
    projectId: string
): Promise<void> {
    const { rows } = await client.query<{ deletion_scheduled_at: Date | null }>(
        `select deletion_scheduled_at
        from projects
        where id = $1
        for share`,
        [projectId]
    );

    if (rows[0]?.deletion_scheduled_at) {
        throw new Error("the project is being deleted");
    }
}

async function endMembership(
    client: PoolClient,
    member: { projectId: string; userId: string }
): Promise<void> {
    const { rows } = await client.query<{ id: string; role: Role }>(
        `select id, role from memberships
        where project_id = $1
        and user_id = $2
        and ended_at is null
        for update`,
        [member.projectId, member.userId]
    );

    const membership = rows[0];

    if (!membership) {
        throw new Error("removeMember: membership not found");
    }

    if (membership.role === "lead") {
        throw new Error("Cannot remove the project's lead");
    }

    await client.query(
        `update memberships
        set ended_at = now()
        where id = $1`,
        [membership.id]
    );

    await client.query(
        `update tasks
        set assignee_membership_id = null
        where assignee_membership_id = $1`,
        [membership.id]
    );

    await client.query(
        `update subtasks
        set assignee_membership_id = null
        where assignee_membership_id = $1`,
        [membership.id]
    );
}