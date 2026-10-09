import { describe, it, expect } from "vitest";
import { pool } from "../db.js";
import {
    createUser,
    createProject,
    createTask,
    listTasks,
    deleteTask,
    moveTask,
    setTaskNotes,
    addMember,
    deleteProject,
    purgeDeletedProjects,
    createSubtask,
    setTaskDueDate,
    createInvite,
} from "../queries.js";


describe("4_tasks", () => {
    it("creates a task in a project", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });

        //TEST
        expect(task.title).toBe("Draft the homepage");
        expect(task.project_id).toBe(project.id);
        expect(typeof task.id).toBe("string");
        expect(task.created_at).toBeInstanceOf(Date);
    });

    it("refuses a task with a blank title", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);

        //TEST
        await expect(
            createTask({ projectId: project.id, title: "   " })
        ).rejects.toMatchObject({ code: "23514", constraint: "tasks_title_not_blank" });
    });

    it("refuses a task in a project that does not exist", async () => {
        //TEST
        await expect(
            createTask({ projectId: "999", title: "Draft the homepage" })
        ).rejects.toMatchObject({ code: "23503", constraint: "tasks_project_id_fkey" });
    });

    it("lists a project's tasks, oldest first", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const otherProject = await createProject("Mobile app", lead.id);

        //TEST
        await createTask({ projectId: project.id, title: "First" });
        await createTask({ projectId: project.id, title: "Second" });
        await createTask({ projectId: otherProject.id, title: "Elsewhere" });

        const tasks = await listTasks({ projectId: project.id, userId: lead.id });

        expect(tasks).toHaveLength(2);
        expect(tasks[0]?.title).toBe("First");
        expect(tasks[1]?.title).toBe("Second");
    });

    it("shows nothing to someone who is not a member", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const outsider = await createUser("outsider@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        await createTask({ projectId: project.id, title: "First" });

        //TEST
        const tasks = await listTasks({ projectId: project.id, userId: outsider.id });
        expect(tasks).toHaveLength(0);
    });

    it("starts a new task as not started, with no priority", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });

        //TEST
        expect(task.status).toBe("not_started");
        expect(task.priority).toBeNull();
    });

    it("refuses a status that is not on the list", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });

        //TEST
        await expect(
            pool.query("update tasks set status = 'done' where id = $1", [task.id])
        ).rejects.toMatchObject({ code: "23514", constraint: "tasks_status_valid" });
    });

    it("refuses a priority that is not on the list", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });

        //TEST
        await expect(
            pool.query("update tasks set priority = 'urgent' where id = $1", [task.id])
        ).rejects.toMatchObject({ code: "23514", constraint: "tasks_priority_valid" });
    });

    it("keeps a due date as the calendar day it was given", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Launch", dueDate: "2026-09-18" });

        //TEST
        expect(task.due_date).toBe("2026-09-18");
    });

    it("leaves the due date empty when none is given", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });

        //TEST
        expect(task.due_date).toBeNull();
    });

    it("hides a deleted task from the list", async () => {
        //CEATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const kept = await createTask({ projectId: project.id, title: "Keep me" });
        const deleted = await createTask({ projectId: project.id, title: "Delete me" });

        //TEST
        await deleteTask(deleted.id);
        const tasks = await listTasks({ projectId: project.id, userId: lead.id });
        expect(tasks).toHaveLength(1);
        expect(tasks[0]?.id).toBe(kept.id);
    });

    it("keeps a deleted task's row, with the time it was deleted", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Delete me" });

        //TEST
        await deleteTask(task.id);

        const { rows } = await pool.query<{ deleted_at: Date | null }>(
            "select deleted_at from tasks where id = $1",
            [task.id]
        );

        expect(rows).toHaveLength(1);
        expect(rows[0]?.deleted_at).toBeInstanceOf(Date);
    });

    it("puts a new task at the end of the list", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        await createTask({ projectId: project.id, title: "First" });
        await createTask({ projectId: project.id, title: "Second" });
        await createTask({ projectId: project.id, title: "Third" });

        //TEST
        const tasks = await listTasks({ projectId: project.id, userId: lead.id });
        expect(tasks.map((task) => task.title)).toEqual(
            ["First", "Second", "Third"]
        );
    });

    it("spaces positions so there is room between tasks", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const first = await createTask({ projectId: project.id, title: "First" });
        const second = await createTask({ projectId: project.id, title: "Second" });

        //TEST
        expect(first.position).toBe(65536);
        expect(second.position).toBe(131072);
    });

    it("moves a task between two others", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const first = await createTask({ projectId: project.id, title: "First" });
        const second = await createTask({ projectId: project.id, title: "Second" });
        const third = await createTask({ projectId: project.id, title: "Third" });

        //TEST
        await moveTask({ taskId: third.id, afterTaskId: first.id, beforeTaskId: second.id });
        const tasks = await listTasks({ projectId: project.id, userId: lead.id });
        expect(tasks.map((task) => task.title)).toEqual(["First", "Third", "Second"]);
        expect(tasks[0]?.position).toBe(65536);
        expect(tasks[1]?.position).toBe(98304);
        expect(tasks[2]?.position).toBe(131072);
    });

    it("makes room when two tasks are next to each other", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const moved = await createTask({ projectId: project.id, title: "Moved" });
        const left = await createTask({ projectId: project.id, title: "Left" });
        const right = await createTask({ projectId: project.id, title: "Right" });

        //TEST
        await pool.query("update tasks set position = 10 where id = $1", [left.id]);
        await pool.query("update tasks set position = 11 where id = $1", [right.id]);
        await moveTask({ taskId: moved.id, afterTaskId: left.id, beforeTaskId: right.id });
        const tasks = await listTasks({ projectId: project.id, userId: lead.id });
        expect(tasks.map((task) => task.title)).toEqual(["Left", "Moved", "Right"]);
    });

    it("moves a task to the top of the list", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const first = await createTask({ projectId: project.id, title: "First" });
        await createTask({ projectId: project.id, title: "Second" });
        const third = await createTask({ projectId: project.id, title: "Third" });

        //TEST
        await moveTask({ taskId: third.id, beforeTaskId: first.id });
        const tasks = await listTasks({ projectId: project.id, userId: lead.id });
        expect(tasks.map((task) => task.title)).toEqual(["Third", "First", "Second"]);
        expect(tasks[0]?.position).toBe(32768);
    });

    it("moves a task to the bottom of the list", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const first = await createTask({ projectId: project.id, title: "First" });
        await createTask({ projectId: project.id, title: "Second" });
        const third = await createTask({ projectId: project.id, title: "Third" });

        //TEST
        await moveTask({ taskId: first.id, afterTaskId: third.id });
        const tasks = await listTasks({ projectId: project.id, userId: lead.id });
        expect(tasks.map((task) => task.title)).toEqual(["Second", "Third", "First"]);
        expect(tasks[2]?.position).toBe(262144);
    });

    it("makes room at the top when the first task sits at 1", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const first = await createTask({ projectId: project.id, title: "First" });
        await createTask({ projectId: project.id, title: "Second" });
        const third = await createTask({ projectId: project.id, title: "Third" });

        //TEST
        await pool.query("update tasks set position = 1 where id = $1", [first.id]);
        await moveTask({ taskId: third.id, beforeTaskId: first.id });
        const tasks = await listTasks({ projectId: project.id, userId: lead.id });
        expect(tasks.map((task) => task.title)).toEqual(["Third", "First", "Second"]);
        expect(tasks[0]?.position).toBe(65536);
    });

    it("saves notes on a task", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });

        //TEST
        await setTaskNotes({ taskId: task.id, notes: "Call the printer first" });
        const tasks = await listTasks({ projectId: project.id, userId: lead.id });
        expect(tasks[0]?.notes).toBe("Call the printer first");
    });

    it("stores blank notes as empty", async () => {
        //CCREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });

        //TEST
        await setTaskNotes({ taskId: task.id, notes: "   " });
        const tasks = await listTasks({ projectId: project.id, userId: lead.id });
        expect(tasks[0]?.notes).toBeNull();
    });

    it("refuses blank notes written straight to the table", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });

        //TEST
        await expect(
            pool.query("update tasks set notes = '' where id = $1", [task.id])
        ).rejects.toMatchObject({ code: "23514", constraint: "tasks_notes_not_blank" });
    });

    it("refuses to change a deleted task's date, and leaves its subtasks alone", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({
            projectId: project.id,
            title: "Draft the homepage",
            dueDate: "2026-09-20",
        });
        const subtask = await createSubtask({
            taskId: task.id,
            title: "Write the headline",
            dueDate: "2026-09-19",
        });

        //TEST
        await deleteTask(task.id);
        await expect(
            setTaskDueDate({ taskId: task.id, dueDate: "2026-09-10" })
        ).rejects.toMatchObject({ message: "setTaskDueDate: task not found" });

        const { rows } = await pool.query<{ due_date: string | null }>(
            "select due_date from subtasks where id = $1",
            [subtask.id]
        );

        expect(rows[0]?.due_date).toBe("2026-09-19");
    });

    it("refuses to move a task next to tasks in another project", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const website = await createProject("Website", lead.id);
        const app = await createProject("Mobile app", lead.id);
        const first = await createTask({ projectId: website.id, title: "First" });
        const second = await createTask({ projectId: website.id, title: "Second" });
        const outsider = await createTask({ projectId: app.id, title: "From the other project" });

        //TEST
        await expect(
            moveTask({ taskId: outsider.id, afterTaskId: first.id, beforeTaskId: second.id })
        ).rejects.toMatchObject({
            message: "moveTask: the task and its neighbours must be in the same project",
        });

        const { rows } = await pool.query<{ position: number }>(
            "select position from tasks where id = $1",
            [outsider.id]
        );

        expect(rows[0]?.position).toBe(65536);
    });

    it("refuses to move a deleted task", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const first = await createTask({ projectId: project.id, title: "First" });
        const second = await createTask({ projectId: project.id, title: "Second" });
        const third = await createTask({ projectId: project.id, title: "Third" });

        //TEST
        await deleteTask(third.id);
        await expect(
            moveTask({ taskId: third.id, afterTaskId: first.id, beforeTaskId: second.id })
        ).rejects.toMatchObject({ message: "moveTask: task not found" });
    });

    it("refuses a deleted task as a neighbour", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const first = await createTask({ projectId: project.id, title: "First" });
        await createTask({ projectId: project.id, title: "Second" });
        const third = await createTask({ projectId: project.id, title: "Third" });

        //TEST
        await deleteTask(first.id);
        await expect(
            moveTask({ taskId: third.id, beforeTaskId: first.id })
        ).rejects.toMatchObject({ message: "moveTask: a neighbour was not found" });
    });

    it("refuses notes on a deleted task", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });

        //TEST
        await deleteTask(task.id);
        await expect(
            setTaskNotes({ taskId: task.id, notes: "Call the printer first" })
        ).rejects.toMatchObject({ message: "setTaskNotes: task not found" });
    });

    it("makes room at the bottom when the last task sits at the integer ceiling", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const first = await createTask({ projectId: project.id, title: "First" });
        const second = await createTask({ projectId: project.id, title: "Second" });

        //TEST
        await pool.query("update tasks set position = 2147483647 where id = $1", [second.id]);
        await moveTask({ taskId: first.id, afterTaskId: second.id });
        const tasks = await listTasks({ projectId: project.id, userId: lead.id });
        expect(tasks.map((task) => task.title)).toEqual(["Second", "First"]);
        expect(tasks[0]?.position).toBe(65536);
        expect(tasks[1]?.position).toBe(131072);
    });

    it("renumbers before adding a task when the last position is at the ceiling", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const first = await createTask({ projectId: project.id, title: "First" });

        //TEST
        await pool.query("update tasks set position = 2147483647 where id = $1", [first.id]);
        await createTask({ projectId: project.id, title: "Second" });
        const tasks = await listTasks({ projectId: project.id, userId: lead.id });
        expect(tasks.map((task) => task.title)).toEqual(["First", "Second"]);
        expect(tasks[0]?.position).toBe(65536);
        expect(tasks[1]?.position).toBe(131072);
    });

    it("refuses a task deleted before it was created", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });

        //TEST
        await expect(
            pool.query(
                `update tasks
                set deleted_at = created_at - interval '1 day'
                where id = $1`,
                [task.id]
            )
        ).rejects.toMatchObject({
            code: "23514",
            constraint: "tasks_deleted_after_created",
        });
    });

    it("assigns a task to a member of its own project", async () => {
        //CCREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });

        //TEST
        const membership = await pool.query<{ id: string }>(
            `select id from memberships
            where project_id = $1
            and user_id = $2`,
            [project.id, lead.id]
        );
        const membershipId = membership.rows[0]?.id;

        await pool.query(
            `update tasks
            set assignee_membership_id = $1
            where id = $2`,
            [membershipId, task.id]
        );

        const after = await pool.query<{ assignee_membership_id: string | null }>(
            `select assignee_membership_id from tasks where id = $1`,
            [task.id]
        );

        expect(after.rows[0]?.assignee_membership_id).toBe(membershipId);
    });

    it("refuses an assignee whose membership belongs to another project", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const website = await createProject("Website", lead.id);
        const newsletter = await createProject("Newsletter", lead.id);
        const task = await createTask({ projectId: website.id, title: "Draft the homepage" });

        //TEST
        const elsewhere = await pool.query<{ id: string }>(
            `select id from memberships
            where project_id = $1
            and user_id = $2`,
            [newsletter.id, lead.id]
        );

        await expect(
            pool.query(
                `update tasks
                set assignee_membership_id = $1
                where id = $2`,
                [elsewhere.rows[0]?.id, task.id]
            )
        ).rejects.toMatchObject({
            code: "23503",
            constraint: "tasks_assignee_in_project",
        });
    });

    it("empties the assignee when the membership is truly deleted, and keeps the task", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const other = await createUser("other@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        await addMember({ projectId: project.id, userId: other.id, role: "associate" });
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });

        //TEST
        const membership = await pool.query<{ id: string }>(
            `select id from memberships
            where project_id = $1
            and user_id = $2`,
            [project.id, other.id]
        );
        const membershipId = membership.rows[0]?.id;

        await pool.query(
            `update tasks
            set assignee_membership_id = $1
            where id = $2`,
            [membershipId, task.id]
        );

        await pool.query(`delete from memberships where id = $1`, [membershipId]);

        const after = await pool.query<{ assignee_membership_id: string | null }>(
            `select assignee_membership_id from tasks where id = $1`,
            [task.id]
        );

        expect(after.rowCount).toBe(1);
        expect(after.rows[0]?.assignee_membership_id).toBeNull();
    });

    it("shows the assignee through visible_tasks", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });

        //TEST
        const membership = await pool.query<{ id: string }>(
            `select id from memberships
            where project_id = $1
            and user_id = $2`,
            [project.id, lead.id]
        );
        const membershipId = membership.rows[0]?.id;

        await pool.query(
            `update tasks
            set assignee_membership_id = $1
            where id = $2`,
            [membershipId, task.id]
        );

        const visible = await pool.query<{ assignee_membership_id: string | null }>(
            `select assignee_membership_id from visible_tasks where id = $1`,
            [task.id]
        );

        expect(visible.rows[0]?.assignee_membership_id).toBe(membershipId);
    });

    it("assigns a new task to the project's Lead", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });

        //TEST
        const membership = await pool.query<{ id: string }>(
            `select id from memberships
            where project_id = $1
            and user_id = $2`,
            [project.id, lead.id]
        );

        expect(task.assignee_membership_id).toBe(membership.rows[0]?.id);
    });

    it("hides the tasks of a project being deleted", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        await createTask({ projectId: project.id, title: "Draft the homepage" });

        //TEST
        await deleteProject(project.id);
        expect(await listTasks({ projectId: project.id, userId: lead.id })).toEqual([]);
    });

    it("refuses to change a task's notes while its project is being deleted", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });

        //TEST
        await deleteProject(project.id);
        await expect(
            setTaskNotes({ taskId: task.id, notes: "Call the printer first" })
        ).rejects.toMatchObject({ message: "setTaskNotes: task not found" });
    });

    it("refuses to change a task's date while its project is being deleted, and leaves its subtasks alone", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({
            projectId: project.id,
            title: "Draft the homepage",
            dueDate: "2026-10-20",
        });
        const subtask = await createSubtask({
            taskId: task.id,
            title: "Write the headline",
            dueDate: "2026-10-19",
        });

        //TEST
        await deleteProject(project.id);
        await expect(
            setTaskDueDate({ taskId: task.id, dueDate: "2026-10-10" })
        ).rejects.toMatchObject({ message: "setTaskDueDate: task not found" });

        const taskAfter = await pool.query<{ due_date: string | null }>(
            `select due_date from tasks where id = $1`,
            [task.id]
        );
        const subtaskAfter = await pool.query<{ due_date: string | null }>(
            `select due_date from subtasks where id = $1`,
            [subtask.id]
        );

        expect(taskAfter.rows[0]?.due_date).toBe("2026-10-20");
        expect(subtaskAfter.rows[0]?.due_date).toBe("2026-10-19");
    });

    it("refuses to create a task while the project is being deleted", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);

        //TEST
        await deleteProject(project.id);
        await expect(
            createTask({ projectId: project.id, title: "Draft the homepage" })
        ).rejects.toMatchObject({ message: "the project is being deleted" });
        const tasks = await pool.query(`select id from tasks where project_id = $1`, [project.id]);
        expect(tasks.rowCount).toBe(0);
    });

    it("refuses to delete a task while its project is being deleted", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });

        //TEST
        await deleteProject(project.id);
        await expect(deleteTask(task.id)).rejects.toMatchObject({
            message: "deleteTask: task not found",
        });

        const { rows } = await pool.query<{ deleted_at: Date | null }>(
            `select deleted_at from tasks where id = $1`,
            [task.id]
        );

        expect(rows[0]?.deleted_at).toBeNull();
    });

    it("purges only the projects past their deletion date", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const expired = await createProject("Website", lead.id);
        const waiting = await createProject("Newsletter", lead.id);
        const active = await createProject("Mobile app", lead.id);

        //TEST
        await deleteProject(expired.id);
        await deleteProject(waiting.id);
        await pool.query(
            `update projects
            set deletion_scheduled_at = now() - interval '1 day'
            where id = $1`,
            [expired.id]
        );

        const { purged } = await purgeDeletedProjects();
        const left = await pool.query<{ id: string }>(`select id from projects order by id`);
        expect(purged).toBe(1);
        expect(left.rows.map((p) => p.id)).toEqual([waiting.id, active.id]);
    });

    it("takes a purged project's members, tasks, subtasks and invites with it", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        await createUser("ana@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });
        await createSubtask({ taskId: task.id, title: "Write the headline" });
        await createInvite({
            projectId: project.id,
            email: "ana@example.com",
            invitedByUserId: lead.id,
        });

        //TEST
        await deleteProject(project.id);
        await pool.query(
            `update projects
            set deletion_scheduled_at = now() - interval '1 day'
            where id = $1`,
            [project.id]
        );

        await purgeDeletedProjects();
        const memberships = await pool.query(`select id from memberships where project_id = $1`, [
            project.id,
        ]);
        const tasks = await pool.query(`select id from tasks where project_id = $1`, [project.id]);
        const subtasks = await pool.query(`select id from subtasks where task_id = $1`, [task.id]);
        const invites = await pool.query(`select id from invites where project_id = $1`, [
            project.id,
        ]);

        expect(memberships.rowCount).toBe(0);
        expect(tasks.rowCount).toBe(0);
        expect(subtasks.rowCount).toBe(0);
        expect(invites.rowCount).toBe(0);
    });
    
});