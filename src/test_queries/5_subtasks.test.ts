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
} from "../queries.js";


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
});