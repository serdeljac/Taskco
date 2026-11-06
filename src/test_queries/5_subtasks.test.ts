import { describe, it, expect } from "vitest";
import { pool } from "../db.js";
import {
    createUser,
    createProject,
    createTask,
    createSubtask,
    listSubtasks,
    deleteTask,
    setSubtaskDueDate,
    setTaskDueDate,
    setSubtaskNotes,
    setSubtaskAssignee,
    addMember,
    setTaskAssignee,
    deleteProject,
    findSubtaskProject,
    setSubtaskStatus,
    setSubtaskPriority,
    deleteSubtask,
    renameSubtask,
    moveSubtask,
} from "../queries.js";

//Today and yesterday for one user, as calendar days in their own timezone, from user_today
async function todayFor(userId: string) {
    const { rows } = await pool.query<{ today: string; yesterday: string }>(
        `select today::text as today, (today - 1)::text as yesterday from user_today where user_id = $1`,
        [userId]
    );
    return rows[0]!;
}


describe("subtasks", () => {
    it("refuses more than 50 subtasks on one task", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });

        //TEST
        for (let i = 1; i <= 50; i++) {
            await createSubtask({ taskId: task.id, title: `Step ${i}` });
        }

        await expect(
            createSubtask({ taskId: task.id, title: "Step 51" })
        ).rejects.toMatchObject({ message: "createSubtask: a task can have at most 50 subtasks" });
    });

    it("refuses a subtask due after its task", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({
            projectId: project.id,
            title: "Draft the homepage",
            dueDate: "2026-09-18",
        });

        //TEST
        await expect(
            createSubtask({ taskId: task.id, title: "Too late", dueDate: "2026-09-20" })
        ).rejects.toMatchObject({ message: "a subtask cannot be due after its task" });
    });

    it("creates a subtask under a task", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });
        const subtask = await createSubtask({ taskId: task.id, title: "Write the headline" });

        //TEST
        expect(subtask.title).toBe("Write the headline");
        expect(subtask.task_id).toBe(task.id);
        expect(subtask.position).toBe(65536);
    });

    it("lists a task's subtasks in order", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });
        await createSubtask({ taskId: task.id, title: "First" });
        await createSubtask({ taskId: task.id, title: "Second" });

        //TEST
        const subtasks = await listSubtasks({ taskId: task.id, userId: lead.id });
        expect(subtasks.map((subtask) => subtask.title)).toEqual(["First", "Second"]);
    });

    it("refuses a subtask with a blank title", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });

        //TEST
        await expect(
            createSubtask({ taskId: task.id, title: "   " })
        ).rejects.toMatchObject({ code: "23514", constraint: "subtasks_title_not_blank" });
    });

    it("hides the subtasks of a deleted task", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });
        await createSubtask({ taskId: task.id, title: "Write the headline" });

        //TEST
        await deleteTask(task.id);
        const subtasks = await listSubtasks({ taskId: task.id, userId: lead.id });
        expect(subtasks).toHaveLength(0);
    });

    it("allows a subtask due on the same day as its task", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({
            projectId: project.id,
            title: "Draft the homepage",
            dueDate: "2026-09-18",
        });
        const subtask = await createSubtask({
            taskId: task.id,
            title: "On the day",
            dueDate: "2026-09-18",
        });

        //TEST
        expect(subtask.due_date).toBe("2026-09-18");
    });

    it("allows any subtask date when the task has none", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });
        const subtask = await createSubtask({
            taskId: task.id,
            title: "Whenever",
            dueDate: "2027-01-01",
        });

        //TEST
        expect(subtask.due_date).toBe("2027-01-01");
    });

    it("changes a subtask's due date", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({
            projectId: project.id,
            title: "Draft the homepage",
            dueDate: "2026-09-18",
        });
        const subtask = await createSubtask({ taskId: task.id, title: "Write the headline" });

        //TEST
        await setSubtaskDueDate({ subtaskId: subtask.id, dueDate: "2026-09-17" });
        const subtasks = await listSubtasks({ taskId: task.id, userId: lead.id });
        expect(subtasks[0]?.due_date).toBe("2026-09-17");
    });

    it("refuses a changed date that is past its task", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({
            projectId: project.id,
            title: "Draft the homepage",
            dueDate: "2026-09-18",
        });
        const subtask = await createSubtask({ taskId: task.id, title: "Write the headline" });

        //TEST
        await expect(
            setSubtaskDueDate({ subtaskId: subtask.id, dueDate: "2026-09-20" })
        ).rejects.toMatchObject({ message: "a subtask cannot be due after its task" });
    });

    it("clears a subtask's due date", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({
            projectId: project.id,
            title: "Draft the homepage",
            dueDate: "2026-09-18",
        });
        const subtask = await createSubtask({
            taskId: task.id,
            title: "Write the headline",
            dueDate: "2026-09-17",
        });

        //TEST
        await setSubtaskDueDate({ subtaskId: subtask.id, dueDate: null });
        const subtasks = await listSubtasks({ taskId: task.id, userId: lead.id });
        expect(subtasks[0]?.due_date).toBeNull();
    });

    it("clears subtask dates that fall past a task's new date", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({
            projectId: project.id,
            title: "Draft the homepage",
            dueDate: "2026-09-20",
        });
        await createSubtask({ taskId: task.id, title: "Late", dueDate: "2026-09-19" });
        await createSubtask({ taskId: task.id, title: "Early", dueDate: "2026-09-15" });

        //TEST
        const result = await setTaskDueDate({ taskId: task.id, dueDate: "2026-09-16" });
        const subtasks = await listSubtasks({ taskId: task.id, userId: lead.id });
        expect(result.clearedSubtasks).toBe(1);
        expect(subtasks[0]?.due_date).toBeNull();
        expect(subtasks[1]?.due_date).toBe("2026-09-15");
    });

    it("keeps subtask dates when a task's date moves later", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({
            projectId: project.id,
            title: "Draft the homepage",
            dueDate: "2026-09-18",
        });
        await createSubtask({ taskId: task.id, title: "Write the headline", dueDate: "2026-09-17" });

        //TEST
        const result = await setTaskDueDate({ taskId: task.id, dueDate: "2026-09-25" });
        const subtasks = await listSubtasks({ taskId: task.id, userId: lead.id });
        expect(result.clearedSubtasks).toBe(0);
        expect(subtasks[0]?.due_date).toBe("2026-09-17");
    });

    it("keeps subtask dates when a task's date is removed", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({
            projectId: project.id,
            title: "Draft the homepage",
            dueDate: "2026-09-18",
        });
        await createSubtask({ taskId: task.id, title: "Write the headline", dueDate: "2026-09-17" });

        //TEST
        const result = await setTaskDueDate({ taskId: task.id, dueDate: null });
        const subtasks = await listSubtasks({ taskId: task.id, userId: lead.id });
        expect(result.clearedSubtasks).toBe(0);
        expect(subtasks[0]?.due_date).toBe("2026-09-17");
    });
    
    it("saves notes on a subtask", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });
        const subtask = await createSubtask({ taskId: task.id, title: "Write the headline" });

        //TEST
        await setSubtaskNotes({ subtaskId: subtask.id, notes: "Ask marketing for the tagline" });
        const subtasks = await listSubtasks({ taskId: task.id, userId: lead.id });
        expect(subtasks[0]?.notes).toBe("Ask marketing for the tagline");
    });

    it("refuses a subtask under a deleted task", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });

        //TEST
        await deleteTask(task.id);
        await expect(
            createSubtask({ taskId: task.id, title: "Write the headline" })
        ).rejects.toMatchObject({ message: "createSubtask: task not found" });
    });

    it("refuses to change a subtask's date when its task is deleted", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({
            projectId: project.id,
            title: "Draft the homepage",
            dueDate: "2026-09-20",
        });
        const subtask = await createSubtask({ taskId: task.id, title: "Write the headline" });

        //TEST
        await deleteTask(task.id);
        await expect(
            setSubtaskDueDate({ subtaskId: subtask.id, dueDate: "2026-09-18" })
        ).rejects.toMatchObject({ message: "setSubtaskDueDate: subtask not found" });
    });

    it("refuses notes on a subtask whose task was deleted", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });
        const subtask = await createSubtask({ taskId: task.id, title: "Write the headline" });

        //TEST
        await deleteTask(task.id);
        await expect(
            setSubtaskNotes({ subtaskId: subtask.id, notes: "Ask marketing for the tagline" })
        ).rejects.toMatchObject({ message: "setSubtaskNotes: subtask not found" });
        const { rows } = await pool.query<{ notes: string | null }>(
            "select notes from subtasks where id = $1",
            [subtask.id]
        );
        expect(rows[0]?.notes).toBeNull();
    });

    it("refuses notes on a deleted subtask", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });
        const subtask = await createSubtask({ taskId: task.id, title: "Write the headline" });

        //TEST
        await pool.query("update subtasks set deleted_at = now() where id = $1", [subtask.id]);
        await expect(
            setSubtaskNotes({ subtaskId: subtask.id, notes: "Ask marketing for the tagline" })
        ).rejects.toMatchObject({ message: "setSubtaskNotes: subtask not found" });
    });

    it("refuses notes for a subtask that does not exist", async () => {
        //TEST
        await expect(
            setSubtaskNotes({ subtaskId: "999999", notes: "Ask marketing for the tagline" })
        ).rejects.toMatchObject({ message: "setSubtaskNotes: subtask not found" });
    });

    it("counts only the subtasks the Lead can see, and still clears the deleted one", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({
            projectId: project.id,
            title: "Draft the homepage",
            dueDate: "2026-09-20",
        });
        await createSubtask({ taskId: task.id, title: "Late", dueDate: "2026-09-19" });
        const scrapped = await createSubtask({
            taskId: task.id,
            title: "Scrapped",
            dueDate: "2026-09-19",
        });

        //TEST
        await pool.query("update subtasks set deleted_at = now() where id = $1", [scrapped.id]);
        const result = await setTaskDueDate({ taskId: task.id, dueDate: "2026-09-16" });
        expect(result.clearedSubtasks).toBe(1);
        const { rows } = await pool.query<{ due_date: string | null }>(
            "select due_date from subtasks where id = $1",
            [scrapped.id]
        );
        expect(rows[0]?.due_date).toBeNull();
    });

    it("refuses a subtask deleted before it was created", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });
        const subtask = await createSubtask({ taskId: task.id, title: "Write the headline" });

        //TEST
        await expect(
            pool.query(
                `update subtasks
                set deleted_at = created_at - interval '1 day'
                where id = $1`,
                [subtask.id]
            )
        ).rejects.toMatchObject({
            code: "23514",
            constraint: "subtasks_deleted_after_created",
        });
    });

    it("refuses a subtask deleted in the future", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });
        const subtask = await createSubtask({ taskId: task.id, title: "Write the headline" });

        //TEST
        await expect(
            pool.query(
                `update subtasks
                set deleted_at = now() + interval '1 day'
                where id = $1`,
                [subtask.id]
            )
        ).rejects.toMatchObject({
            code: "23514",
            constraint: "subtasks_deleted_not_in_future",
        });
    });

    it("gives a new subtask the same assignee as its task", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });
        const subtask = await createSubtask({ taskId: task.id, title: "Write the headline" });

        //TEST
        expect(subtask.assignee_membership_id).toBe(task.assignee_membership_id);
        expect(subtask.assignee_membership_id).not.toBeNull();
    });

    it("gives a new subtask no assignee when its task has none", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });

        //TEST
        await pool.query(
            `update tasks
            set assignee_membership_id = null
            where id = $1`,
            [task.id]
        );
        const subtask = await createSubtask({ taskId: task.id, title: "Write the headline" });
        expect(subtask.assignee_membership_id).toBeNull();
    });

    it("refuses a subtask assignee from another project", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const website = await createProject("Website", lead.id);
        const newsletter = await createProject("Newsletter", lead.id);
        const task = await createTask({ projectId: website.id, title: "Draft the homepage" });
        const subtask = await createSubtask({ taskId: task.id, title: "Write the headline" });

        //TEST
        const elsewhere = await pool.query<{ id: string }>(
            `select id from memberships
            where project_id = $1
            and user_id = $2`,
            [newsletter.id, lead.id]
        );

        await expect(
            setSubtaskAssignee({
                subtaskId: subtask.id,
                membershipId: elsewhere.rows[0]?.id ?? null,
            })
        ).rejects.toMatchObject({
            message: "the assignee must be a current member of the project",
        });

        const after = await pool.query<{ assignee_membership_id: string | null }>(
            `select assignee_membership_id from subtasks where id = $1`,
            [subtask.id]
        );

        expect(after.rows[0]?.assignee_membership_id).toBe(task.assignee_membership_id);
    });

    it("leaves existing subtasks alone when the task is reassigned", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const other = await createUser("other@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        await addMember({ projectId: project.id, userId: other.id, role: "associate" });
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });
        await createSubtask({ taskId: task.id, title: "Write the headline" });

        //TEST
        const membership = await pool.query<{ id: string }>(
            `select id from memberships
            where project_id = $1
            and user_id = $2`,
            [project.id, other.id]
        );
        const membershipId = membership.rows[0]?.id ?? null;
        await setTaskAssignee({ taskId: task.id, membershipId });
        const subtasks = await listSubtasks({ taskId: task.id, userId: lead.id });
        expect(subtasks[0]?.assignee_membership_id).toBe(task.assignee_membership_id);
        expect(subtasks[0]?.assignee_membership_id).not.toBe(membershipId);
    });

    it("refuses to change a subtask's due date while its project is being deleted", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({
            projectId: project.id,
            title: "Draft the homepage",
            dueDate: "2026-10-20",
        });
        const subtask = await createSubtask({ taskId: task.id, title: "Write the headline" });

        //TEST
        await deleteProject(project.id);
        await expect(
            setSubtaskDueDate({ subtaskId: subtask.id, dueDate: "2026-10-19" })
        ).rejects.toMatchObject({ message: "setSubtaskDueDate: subtask not found" });
    });

    it("finds the project a subtask is in", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });
        const subtask = await createSubtask({ taskId: task.id, title: "Write the headline" });

        //TEST
        expect(await findSubtaskProject(subtask.id)).toBe(project.id);
    });

    it("finds no project for a subtask whose task was deleted", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });
        const subtask = await createSubtask({ taskId: task.id, title: "Write the headline" });
        await deleteTask(task.id);

        //TEST
        expect(await findSubtaskProject(subtask.id)).toBeUndefined();
    });

    it("changes a subtask's status", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });
        const subtask = await createSubtask({ taskId: task.id, title: "Write the headline" });

        //TEST
        await setSubtaskStatus({ subtaskId: subtask.id, status: "completed" });

        const subtasks = await listSubtasks({ taskId: task.id, userId: lead.id });
        expect(subtasks[0]?.status).toBe("completed");
    });

    it("refuses to change the status of a subtask whose task was deleted", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });
        const subtask = await createSubtask({ taskId: task.id, title: "Write the headline" });
        await deleteTask(task.id);

        //TEST
        await expect(
            setSubtaskStatus({ subtaskId: subtask.id, status: "completed" })
        ).rejects.toMatchObject({ message: "setSubtaskStatus: subtask not found" });

        const row = await pool.query("select status from subtasks where id = $1", [subtask.id]);
        expect(row.rows[0]?.status).toBe("not_started");
    });

    it("sets and clears a subtask's priority", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });
        const subtask = await createSubtask({ taskId: task.id, title: "Write the headline" });

        //TEST
        await setSubtaskPriority({ subtaskId: subtask.id, priority: "med" });
        expect((await listSubtasks({ taskId: task.id, userId: lead.id }))[0]?.priority).toBe("med");

        await setSubtaskPriority({ subtaskId: subtask.id, priority: null });
        expect((await listSubtasks({ taskId: task.id, userId: lead.id }))[0]?.priority).toBeNull();
    });

    it("refuses to change the priority of a subtask whose task was deleted", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });
        const subtask = await createSubtask({ taskId: task.id, title: "Write the headline" });
        await deleteTask(task.id);

        //TEST
        await expect(
            setSubtaskPriority({ subtaskId: subtask.id, priority: "high" })
        ).rejects.toMatchObject({ message: "setSubtaskPriority: subtask not found" });
    });

    it("deletes a subtask, keeping its row with the time it was deleted", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });
        const subtask = await createSubtask({ taskId: task.id, title: "Write the headline" });

        //TEST
        await deleteSubtask(subtask.id);

        expect(await listSubtasks({ taskId: task.id, userId: lead.id })).toHaveLength(0);
        const row = await pool.query("select deleted_at from subtasks where id = $1", [subtask.id]);
        expect(row.rows[0]?.deleted_at).not.toBeNull();
    });

    it("refuses to delete a subtask twice", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });
        const subtask = await createSubtask({ taskId: task.id, title: "Write the headline" });
        await deleteSubtask(subtask.id);

        //TEST
        await expect(deleteSubtask(subtask.id)).rejects.toMatchObject({
            message: "deleteSubtask: subtask not found",
        });
    });

    it("refuses a subtask due before the asker's today, and takes today itself", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });
        const { today, yesterday } = await todayFor(lead.id);

        //TEST
        await expect(
            createSubtask({ taskId: task.id, title: "Pick photos", dueDate: yesterday, userId: lead.id })
        ).rejects.toMatchObject({ code: "subtask-due-before-today" });

        const subtask = await createSubtask({ taskId: task.id, title: "Pick photos", dueDate: today, userId: lead.id });
        expect(subtask.due_date).toBe(today);
    });

    it("refuses to move a subtask's date before the asker's today", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });
        const subtask = await createSubtask({ taskId: task.id, title: "Pick photos" });
        const { yesterday } = await todayFor(lead.id);

        //TEST
        await expect(
            setSubtaskDueDate({ subtaskId: subtask.id, dueDate: yesterday, userId: lead.id })
        ).rejects.toMatchObject({ code: "subtask-due-before-today" });

        const subtasks = await listSubtasks({ taskId: task.id, userId: lead.id });
        expect(subtasks[0]?.due_date).toBeNull();
    });

    it("judges today by the asker's timezone", async () => {
        //CREATE
        //Kiritimati is UTC+14 and Pago Pago UTC−11: twenty-five hours apart, so never the same day
        const east = await createUser("east@example.com", "Pacific/Kiritimati");
        const west = await createUser("west@example.com", "Pacific/Pago_Pago");
        const project = await createProject("Website", east.id);
        await addMember({ projectId: project.id, userId: west.id, role: "associate" });
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });
        const westToday = (await todayFor(west.id)).today;

        //TEST
        await expect(
            createSubtask({ taskId: task.id, title: "Pick photos", dueDate: westToday, userId: east.id })
        ).rejects.toMatchObject({ code: "subtask-due-before-today" });

        const subtask = await createSubtask({ taskId: task.id, title: "Pick photos", dueDate: westToday, userId: west.id });
        expect(subtask.due_date).toBe(westToday);
    });

    it("keeps an overdue subtask savable: the rule is checked when a date is set, and clearing sets none", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });
        const { yesterday } = await todayFor(lead.id);
        //Due yesterday, as a subtask set while that was still ahead would be now
        const subtask = await createSubtask({ taskId: task.id, title: "Pick photos", dueDate: yesterday });

        //TEST
        await setSubtaskNotes({ subtaskId: subtask.id, notes: "Late, still wanted", });
        await setSubtaskDueDate({ subtaskId: subtask.id, dueDate: null, userId: lead.id });

        const subtasks = await listSubtasks({ taskId: task.id, userId: lead.id });
        expect(subtasks[0]).toMatchObject({ notes: "Late, still wanted", due_date: null });
    });

    it("renames a subtask", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });
        const subtask = await createSubtask({ taskId: task.id, title: "Pick photos" });

        //TEST
        await renameSubtask({ subtaskId: subtask.id, title: "Pick the hero photo" });

        const subtasks = await listSubtasks({ taskId: task.id, userId: lead.id });
        expect(subtasks[0]?.title).toBe("Pick the hero photo");
    });

    it("refuses a blank title when renaming a subtask", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });
        const subtask = await createSubtask({ taskId: task.id, title: "Pick photos" });

        //TEST
        await expect(
            renameSubtask({ subtaskId: subtask.id, title: "   " })
        ).rejects.toMatchObject({ code: "23514", constraint: "subtasks_title_not_blank" });
    });

    it("refuses to rename a deleted subtask, or one under a deleted task", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });
        const deleted = await createSubtask({ taskId: task.id, title: "Pick photos" });
        const orphaned = await createSubtask({ taskId: task.id, title: "Write captions" });
        await deleteSubtask(deleted.id);

        //TEST
        await expect(
            renameSubtask({ subtaskId: deleted.id, title: "Pick the hero photo" })
        ).rejects.toMatchObject({ message: "renameSubtask: subtask not found" });

        await deleteTask(task.id);
        await expect(
            renameSubtask({ subtaskId: orphaned.id, title: "Write the captions" })
        ).rejects.toMatchObject({ message: "renameSubtask: subtask not found" });
    });
});

describe("moving subtasks", () => {
    //A task with three subtasks, First, Second and Third, at 65536, 131072 and 196608
    async function threeSubtasks() {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });
        const first = await createSubtask({ taskId: task.id, title: "First" });
        const second = await createSubtask({ taskId: task.id, title: "Second" });
        const third = await createSubtask({ taskId: task.id, title: "Third" });
        const order = async () =>
            (await listSubtasks({ taskId: task.id, userId: lead.id })).map((subtask) => `${subtask.title} ${subtask.position}`);
        return { lead, project, task, first, second, third, order };
    }

    it("moves a subtask between two others, writing only its own position", async () => {
        //CREATE
        const { first, second, third, order } = await threeSubtasks();

        //TEST
        await moveSubtask({ subtaskId: third.id, afterSubtaskId: first.id, beforeSubtaskId: second.id });
        expect(await order()).toEqual(["First 65536", "Third 98304", "Second 131072"]);
    });

    it("moves a subtask to the top, and to the bottom", async () => {
        //CREATE
        const { first, second, third, order } = await threeSubtasks();

        //TEST
        await moveSubtask({ subtaskId: third.id, beforeSubtaskId: first.id });
        expect(await order()).toEqual(["Third 32768", "First 65536", "Second 131072"]);

        await moveSubtask({ subtaskId: third.id, afterSubtaskId: second.id });
        expect(await order()).toEqual(["First 65536", "Second 131072", "Third 196608"]);
    });

    it("makes room when two subtasks are next to each other", async () => {
        //CREATE
        const { first, second, third, order } = await threeSubtasks();

        //TEST
        await pool.query("update subtasks set position = 10 where id = $1", [second.id]);
        await pool.query("update subtasks set position = 11 where id = $1", [third.id]);
        await moveSubtask({ subtaskId: first.id, afterSubtaskId: second.id, beforeSubtaskId: third.id });
        expect(await order()).toEqual(["Second 65536", "First 131072", "Third 196608"]);
    });

    it("makes room at the bottom when the last subtask sits at the integer ceiling", async () => {
        //CREATE
        const { first, third, order } = await threeSubtasks();

        //TEST
        await pool.query("update subtasks set position = 2147483647 where id = $1", [third.id]);
        await moveSubtask({ subtaskId: first.id, afterSubtaskId: third.id });
        expect(await order()).toEqual(["Second 65536", "Third 131072", "First 196608"]);
    });

    it("refuses a neighbour under another task, and moves nothing", async () => {
        //CREATE
        const { project, first, second, order } = await threeSubtasks();
        const other = await createTask({ projectId: project.id, title: "Pick a font" });
        const outsider = await createSubtask({ taskId: other.id, title: "From the other task" });

        //TEST
        await expect(
            moveSubtask({ subtaskId: outsider.id, afterSubtaskId: first.id, beforeSubtaskId: second.id })
        ).rejects.toMatchObject({
            code: "neighbour-in-another-task",
            message: "moveSubtask: the subtask and its neighbours must be under the same task",
        });
        expect(await order()).toEqual(["First 65536", "Second 131072", "Third 196608"]);
    });

    it("refuses a subtask as its own neighbour, on either side", async () => {
        //CREATE
        const { second, order } = await threeSubtasks();

        //TEST
        const ownNeighbour = { code: "own-neighbour", message: "moveSubtask: a subtask cannot be its own neighbour" };
        await expect(moveSubtask({ subtaskId: second.id, afterSubtaskId: second.id })).rejects.toMatchObject(ownNeighbour);
        await expect(moveSubtask({ subtaskId: second.id, beforeSubtaskId: second.id })).rejects.toMatchObject(ownNeighbour);
        expect(await order()).toEqual(["First 65536", "Second 131072", "Third 196608"]);
    });

    it("refuses a move that names no neighbour", async () => {
        //CREATE
        const { second } = await threeSubtasks();

        //TEST
        await expect(moveSubtask({ subtaskId: second.id })).rejects.toMatchObject({
            code: "no-neighbour",
            message: "moveSubtask: give at least one neighbour",
        });
    });

    it("refuses a deleted subtask, or a deleted one as a neighbour", async () => {
        //CREATE
        const { first, third } = await threeSubtasks();

        //TEST
        await deleteSubtask(first.id);
        await expect(moveSubtask({ subtaskId: first.id, afterSubtaskId: third.id })).rejects.toMatchObject({
            message: "moveSubtask: subtask not found",
        });
        await expect(moveSubtask({ subtaskId: third.id, beforeSubtaskId: first.id })).rejects.toMatchObject({
            code: "neighbour-not-found",
            message: "moveSubtask: a neighbour was not found",
        });
    });

    it("refuses to move a subtask under a deleted task", async () => {
        //CREATE
        const { task, first, third } = await threeSubtasks();

        //TEST
        await deleteTask(task.id);
        await expect(moveSubtask({ subtaskId: first.id, afterSubtaskId: third.id })).rejects.toMatchObject({
            message: "moveSubtask: subtask not found",
        });
    });

    it("renumbers before adding a subtask when the last position is at the ceiling", async () => {
        //CREATE
        const { lead, task, third } = await threeSubtasks();

        //TEST
        await pool.query("update subtasks set position = 2147483647 where id = $1", [third.id]);
        await createSubtask({ taskId: task.id, title: "Fourth" });
        const subtasks = await listSubtasks({ taskId: task.id, userId: lead.id });
        expect(subtasks.map((subtask) => `${subtask.title} ${subtask.position}`)).toEqual([
            "First 65536",
            "Second 131072",
            "Third 196608",
            "Fourth 262144",
        ]);
    });
});
