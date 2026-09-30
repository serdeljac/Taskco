import { describe, it, expect } from "vitest";
import { pool } from "./db.js";
import {
    createUser,
    createProject,
    addMember,
    removeMember,
    listProjectsForUser,
    createTask,
    listTasks,
    deleteTask,
    moveTask,
    createSubtask,
    listSubtasks,
    setSubtaskDueDate,
    setTaskDueDate,
    setTaskNotes,
    setSubtaskNotes,
    setTaskAssignee,
    setSubtaskAssignee,
    createInvite,
    acceptInvite,
    declineInvite,
    listInvitesForUser,
    deleteProject,
    restoreProject,
    deleteProjectNow,
} from "./queries.js";

describe("users", () => {
    it("returns a row the database generated", async () => {

        //Create a user and add it into the database (taskco_test)
        //The function is pulled form queries.ts
        const user = await createUser("someone@example.com", "Europe/Zagreb");
        //Compare values
        //The Rules in the .sql files fill in the id and created_at
        expect(user.email).toBe("someone@example.com");
        expect(user.timezone).toBe("Europe/Zagreb");
        expect(typeof user.id).toBe("string");
        expect(user.created_at).toBeInstanceOf(Date);
    });
});

describe("memberships", () => {
    it("refuses to add the same person to a project twice", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const other = await createUser("other@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);

        //Add the member
        await addMember({ projectId: project.id, userId: other.id, role: "associate" });

        // Add the member again and expect the database to refuse it. The partial
        // unique index allows only one *active* membership per person per project.
        await expect(
            addMember({ projectId: project.id, userId: other.id, role: "associate" })
        ).rejects.toMatchObject({ code: "23505" });
    });

    it("returns only the projects a user belongs to", async () => {
        const alice = await createUser("alice@example.com", "Europe/Zagreb");
        const bob = await createUser("bob@example.com", "Europe/Zagreb");

        const aliceProject = await createProject("Alice's work", alice.id);
        await createProject("Bob's work", bob.id);

        const projects = await listProjectsForUser(alice.id);

        expect(projects).toHaveLength(1);
        expect(projects[0]?.id).toBe(aliceProject.id);
    });

    it("stops listing a project once the member has left", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const other = await createUser("other@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);

        await addMember({ projectId: project.id, userId: other.id, role: "associate" });
        expect(await listProjectsForUser(other.id)).toHaveLength(1);

        await removeMember({ projectId: project.id, userId: other.id });
        expect(await listProjectsForUser(other.id)).toHaveLength(0);
    });

    it("refuses a second lead on the same project", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const other = await createUser("other@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);

        await expect(
            addMember({ projectId: project.id, userId: other.id, role: "lead" })
        ).rejects.toMatchObject({ code: "23505", constraint: "memberships_one_lead_idx", });
    });

    it("refuses to remove the project's lead", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);

        await expect(
            removeMember({ projectId: project.id, userId: lead.id })
        ).rejects.toMatchObject({ message: "Cannot remove the project's lead" });
    });

    it("refuses to remove someone who is not a member", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const stranger = await createUser("stranger@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);

        await expect(
            removeMember({ projectId: project.id, userId: stranger.id })
        ).rejects.toMatchObject({ message: "removeMember: membership not found" });
    });

    it("refuses to remove the same member twice", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const other = await createUser("other@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        await addMember({ projectId: project.id, userId: other.id, role: "associate" });

        await removeMember({ projectId: project.id, userId: other.id });

        await expect(
            removeMember({ projectId: project.id, userId: other.id })
        ).rejects.toMatchObject({ message: "removeMember: membership not found" });
    });

    it("refuses a membership that ended before it began", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const other = await createUser("other@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        await addMember({ projectId: project.id, userId: other.id, role: "associate" });

        await expect(
            pool.query(
                `update memberships
                set ended_at = created_at - interval '1 day'
                where user_id = $1`,
                [other.id]
            )
        ).rejects.toMatchObject({
            code: "23514",
            constraint: "memberships_ended_after_created",
        });
    });

    it("takes memberships, tasks and subtasks with it when a project is truly deleted", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const other = await createUser("other@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        await addMember({ projectId: project.id, userId: other.id, role: "associate" });
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });
        await createSubtask({ taskId: task.id, title: "Write the headline" });

        await pool.query("delete from projects where id = $1", [project.id]);

        const memberships = await pool.query("select id from memberships where project_id = $1", [
            project.id,
        ]);
        const tasks = await pool.query("select id from tasks where project_id = $1", [project.id]);
        const subtasks = await pool.query("select id from subtasks where task_id = $1", [task.id]);
        const users = await pool.query("select id from users");

        expect(memberships.rowCount).toBe(0);
        expect(tasks.rowCount).toBe(0);
        expect(subtasks.rowCount).toBe(0);
        expect(users.rowCount).toBe(2);
    });

        it("empties a departing member's assignments, on tasks and subtasks", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const other = await createUser("other@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        await addMember({ projectId: project.id, userId: other.id, role: "associate" });

        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });
        const subtask = await createSubtask({ taskId: task.id, title: "Write the headline" });

        const membership = await pool.query<{ id: string }>(
            `select id from memberships
            where project_id = $1
            and user_id = $2`,
            [project.id, other.id]
        );
        const membershipId = membership.rows[0]?.id;

        await pool.query(`update tasks set assignee_membership_id = $1 where id = $2`, [
            membershipId,
            task.id,
        ]);
        await pool.query(`update subtasks set assignee_membership_id = $1 where id = $2`, [
            membershipId,
            subtask.id,
        ]);

        await removeMember({ projectId: project.id, userId: other.id });

        const after = await pool.query<{ assignee_membership_id: string | null }>(
            `select assignee_membership_id from tasks where id = $1
            union all
            select assignee_membership_id from subtasks where id = $2`,
            [task.id, subtask.id]
        );

        expect(after.rows).toEqual([
            { assignee_membership_id: null },
            { assignee_membership_id: null },
        ]);
    });

    it("assigns a task to another member of the project", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const other = await createUser("other@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        await addMember({ projectId: project.id, userId: other.id, role: "associate" });
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });

        const membership = await pool.query<{ id: string }>(
            `select id from memberships
            where project_id = $1
            and user_id = $2`,
            [project.id, other.id]
        );
        const membershipId = membership.rows[0]?.id ?? null;

        await setTaskAssignee({ taskId: task.id, membershipId });

        const tasks = await listTasks({ projectId: project.id, userId: lead.id });

        expect(tasks[0]?.assignee_membership_id).toBe(membershipId);
    });

    it("leaves a task unassigned when the assignee is set to null", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });

        expect(task.assignee_membership_id).not.toBeNull();

        await setTaskAssignee({ taskId: task.id, membershipId: null });

        const tasks = await listTasks({ projectId: project.id, userId: lead.id });

        expect(tasks[0]?.assignee_membership_id).toBeNull();
    });

    it("refuses an assignee who has left the project", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const other = await createUser("other@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        await addMember({ projectId: project.id, userId: other.id, role: "associate" });
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });

        const membership = await pool.query<{ id: string }>(
            `select id from memberships
            where project_id = $1
            and user_id = $2`,
            [project.id, other.id]
        );
        const membershipId = membership.rows[0]?.id ?? null;

        await removeMember({ projectId: project.id, userId: other.id });

        await expect(
            setTaskAssignee({ taskId: task.id, membershipId })
        ).rejects.toMatchObject({
            message: "the assignee must be a current member of the project",
        });
    });

    it("refuses an assignee from another project", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const website = await createProject("Website", lead.id);
        const newsletter = await createProject("Newsletter", lead.id);
        const task = await createTask({ projectId: website.id, title: "Draft the homepage" });

        const elsewhere = await pool.query<{ id: string }>(
            `select id from memberships
            where project_id = $1
            and user_id = $2`,
            [newsletter.id, lead.id]
        );

        await expect(
            setTaskAssignee({ taskId: task.id, membershipId: elsewhere.rows[0]?.id ?? null })
        ).rejects.toMatchObject({
            message: "the assignee must be a current member of the project",
        });
    });
    
});

describe("projects", () => {

    it("makes the creator a member of the project", async () => {
        //Create the user (note, not a lead/member of anything yet)
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        //Create a project, the function requests a user id to be it's lead
        const project = await createProject("Website", lead.id);
        const projects = await listProjectsForUser(lead.id);

        expect(projects).toHaveLength(1);
        expect(projects[0]?.id).toBe(project.id);
    });

    it("gives the creator the lead role, not associate", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const { rows } = await pool.query(
            "select role from memberships where project_id = $1 and user_id = $2",
            [project.id, lead.id]
        );

        expect(rows).toHaveLength(1);
        expect(rows[0].role).toBe("lead");
    });

    it("refuses a project with a blank name", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");

        await expect(createProject("   ", lead.id)).rejects.toMatchObject({
            code: "23514",
        });
    });

    it("refuses two users with the same email in different cases", async () => {
        await createUser("Person@example.com", "Europe/Zagreb");

        await expect(
            createUser("person@example.com", "Europe/Zagreb")
        ).rejects.toMatchObject({ code: "23505" });
    });

        it("schedules a deleted project thirty days out", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);

        const { scheduledFor } = await deleteProject(project.id);

        const days = (scheduledFor.getTime() - Date.now()) / (1000 * 60 * 60 * 24);

        expect(days).toBeGreaterThan(29.9);
        expect(days).toBeLessThan(30.1);
    });

    it("hides a project being deleted from an associate", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const other = await createUser("other@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        await addMember({ projectId: project.id, userId: other.id, role: "associate" });

        await deleteProject(project.id);

        expect(await listProjectsForUser(other.id)).toEqual([]);
    });

    it("still shows a project being deleted to its Lead, with the date", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);

        await deleteProject(project.id);

        const projects = await listProjectsForUser(lead.id);

        expect(projects.map((p) => p.id)).toEqual([project.id]);
        expect(projects[0]?.deletion_scheduled_at).not.toBeNull();
    });

    it("gives a restored project back to everyone", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const other = await createUser("other@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        await addMember({ projectId: project.id, userId: other.id, role: "associate" });

        await deleteProject(project.id);
        await restoreProject(project.id);

        const forOther = await listProjectsForUser(other.id);

        expect(forOther.map((p) => p.id)).toEqual([project.id]);
        expect(forOther[0]?.deletion_scheduled_at).toBeNull();
    });

    it("refuses to delete a project that is already being deleted", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);

        await deleteProject(project.id);

        await expect(deleteProject(project.id)).rejects.toMatchObject({
            message: "deleteProject: project not found, or already being deleted",
        });
    });

    it("removes the project and everything under it when deleted now", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });
        await createSubtask({ taskId: task.id, title: "Write the headline" });

        await deleteProjectNow(project.id);

        const projects = await pool.query(`select id from projects where id = $1`, [project.id]);
        const tasks = await pool.query(`select id from tasks where project_id = $1`, [project.id]);
        const subtasks = await pool.query(`select id from subtasks where task_id = $1`, [task.id]);

        expect(projects.rowCount).toBe(0);
        expect(tasks.rowCount).toBe(0);
        expect(subtasks.rowCount).toBe(0);
    });
});

describe("tasks", () => {
    it("creates a task in a project", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);

        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });

        expect(task.title).toBe("Draft the homepage");
        expect(task.project_id).toBe(project.id);
        expect(typeof task.id).toBe("string");
        expect(task.created_at).toBeInstanceOf(Date);
    });

    it("refuses a task with a blank title", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);

        await expect(
            createTask({ projectId: project.id, title: "   " })
        ).rejects.toMatchObject({ code: "23514", constraint: "tasks_title_not_blank" });
    });

    it("refuses a task in a project that does not exist", async () => {
        await expect(
            createTask({ projectId: "999", title: "Draft the homepage" })
        ).rejects.toMatchObject({ code: "23503", constraint: "tasks_project_id_fkey" });
    });

    it("lists a project's tasks, oldest first", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const otherProject = await createProject("Mobile app", lead.id);

        await createTask({ projectId: project.id, title: "First" });
        await createTask({ projectId: project.id, title: "Second" });
        await createTask({ projectId: otherProject.id, title: "Elsewhere" });

        const tasks = await listTasks({ projectId: project.id, userId: lead.id });

        expect(tasks).toHaveLength(2);
        expect(tasks[0]?.title).toBe("First");
        expect(tasks[1]?.title).toBe("Second");
    });

    it("shows nothing to someone who is not a member", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const outsider = await createUser("outsider@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);

        await createTask({ projectId: project.id, title: "First" });

        const tasks = await listTasks({ projectId: project.id, userId: outsider.id });

        expect(tasks).toHaveLength(0);
    });

    it("starts a new task as not started, with no priority", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);

        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });

        expect(task.status).toBe("not_started");
        expect(task.priority).toBeNull();
    });

    it("refuses a status that is not on the list", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });

        await expect(
            pool.query("update tasks set status = 'done' where id = $1", [task.id])
        ).rejects.toMatchObject({ code: "23514", constraint: "tasks_status_valid" });
    });

    it("refuses a priority that is not on the list", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });

        await expect(
            pool.query("update tasks set priority = 'urgent' where id = $1", [task.id])
        ).rejects.toMatchObject({ code: "23514", constraint: "tasks_priority_valid" });
    });

    it("keeps a due date as the calendar day it was given", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);

        const task = await createTask({ projectId: project.id, title: "Launch", dueDate: "2026-09-18" });

        expect(task.due_date).toBe("2026-09-18");
    });

    it("leaves the due date empty when none is given", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);

        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });

        expect(task.due_date).toBeNull();
    });

    it("hides a deleted task from the list", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const kept = await createTask({ projectId: project.id, title: "Keep me" });
        const deleted = await createTask({ projectId: project.id, title: "Delete me" });

        await deleteTask(deleted.id);

        const tasks = await listTasks({ projectId: project.id, userId: lead.id });

        expect(tasks).toHaveLength(1);
        expect(tasks[0]?.id).toBe(kept.id);
    });

    it("keeps a deleted task's row, with the time it was deleted", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Delete me" });

        await deleteTask(task.id);

        const { rows } = await pool.query<{ deleted_at: Date | null }>(
            "select deleted_at from tasks where id = $1",
            [task.id]
        );

        expect(rows).toHaveLength(1);
        expect(rows[0]?.deleted_at).toBeInstanceOf(Date);
    });

    it("puts a new task at the end of the list", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);

        await createTask({ projectId: project.id, title: "First" });
        await createTask({ projectId: project.id, title: "Second" });
        await createTask({ projectId: project.id, title: "Third" });

        const tasks = await listTasks({ projectId: project.id, userId: lead.id });

        expect(tasks.map((task) => task.title)).toEqual(
            ["First", "Second", "Third"]
        );
    });

    it("spaces positions so there is room between tasks", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);

        const first = await createTask({ projectId: project.id, title: "First" });
        const second = await createTask({ projectId: project.id, title: "Second" });

        expect(first.position).toBe(65536);
        expect(second.position).toBe(131072);
    });

    it("moves a task between two others", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const first = await createTask({ projectId: project.id, title: "First" });
        const second = await createTask({ projectId: project.id, title: "Second" });
        const third = await createTask({ projectId: project.id, title: "Third" });

        await moveTask({ taskId: third.id, afterTaskId: first.id, beforeTaskId: second.id });

        const tasks = await listTasks({ projectId: project.id, userId: lead.id });

        expect(tasks.map((task) => task.title)).toEqual(["First", "Third", "Second"]);
        expect(tasks[0]?.position).toBe(65536);
        expect(tasks[1]?.position).toBe(98304);
        expect(tasks[2]?.position).toBe(131072);
    });

    it("makes room when two tasks are next to each other", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const moved = await createTask({ projectId: project.id, title: "Moved" });
        const left = await createTask({ projectId: project.id, title: "Left" });
        const right = await createTask({ projectId: project.id, title: "Right" });

        await pool.query("update tasks set position = 10 where id = $1", [left.id]);
        await pool.query("update tasks set position = 11 where id = $1", [right.id]);

        await moveTask({ taskId: moved.id, afterTaskId: left.id, beforeTaskId: right.id });

        const tasks = await listTasks({ projectId: project.id, userId: lead.id });

        expect(tasks.map((task) => task.title)).toEqual(["Left", "Moved", "Right"]);
    });

    it("moves a task to the top of the list", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const first = await createTask({ projectId: project.id, title: "First" });
        await createTask({ projectId: project.id, title: "Second" });
        const third = await createTask({ projectId: project.id, title: "Third" });

        await moveTask({ taskId: third.id, beforeTaskId: first.id });

        const tasks = await listTasks({ projectId: project.id, userId: lead.id });

        expect(tasks.map((task) => task.title)).toEqual(["Third", "First", "Second"]);
        expect(tasks[0]?.position).toBe(32768);
    });

    it("moves a task to the bottom of the list", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const first = await createTask({ projectId: project.id, title: "First" });
        await createTask({ projectId: project.id, title: "Second" });
        const third = await createTask({ projectId: project.id, title: "Third" });

        await moveTask({ taskId: first.id, afterTaskId: third.id });

        const tasks = await listTasks({ projectId: project.id, userId: lead.id });

        expect(tasks.map((task) => task.title)).toEqual(["Second", "Third", "First"]);
        expect(tasks[2]?.position).toBe(262144);
    });

    it("makes room at the top when the first task sits at 1", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const first = await createTask({ projectId: project.id, title: "First" });
        await createTask({ projectId: project.id, title: "Second" });
        const third = await createTask({ projectId: project.id, title: "Third" });

        await pool.query("update tasks set position = 1 where id = $1", [first.id]);

        await moveTask({ taskId: third.id, beforeTaskId: first.id });

        const tasks = await listTasks({ projectId: project.id, userId: lead.id });

        expect(tasks.map((task) => task.title)).toEqual(["Third", "First", "Second"]);
        expect(tasks[0]?.position).toBe(65536);
    });

    /* TEST NOTES */

    it("saves notes on a task", async () => {
        //Check not only to see if the note is saved, but it contains the right contents
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });

        await setTaskNotes({ taskId: task.id, notes: "Call the printer first" });

        const tasks = await listTasks({ projectId: project.id, userId: lead.id });

        expect(tasks[0]?.notes).toBe("Call the printer first");
    });

    it("stores blank notes as empty", async () => {
        //Check to see what an empty note returns as
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });

        await setTaskNotes({ taskId: task.id, notes: "   " });

        const tasks = await listTasks({ projectId: project.id, userId: lead.id });

        expect(tasks[0]?.notes).toBeNull();
    });

    it("refuses blank notes written straight to the table", async () => {
        //Ensure you cannot add a note directly into the table
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });

        await expect(
            pool.query("update tasks set notes = '' where id = $1", [task.id])
        ).rejects.toMatchObject({ code: "23514", constraint: "tasks_notes_not_blank" });
    });

    it("refuses to change a deleted task's date, and leaves its subtasks alone", async () => {
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
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const website = await createProject("Website", lead.id);
        const app = await createProject("Mobile app", lead.id);
        const first = await createTask({ projectId: website.id, title: "First" });
        const second = await createTask({ projectId: website.id, title: "Second" });
        const outsider = await createTask({ projectId: app.id, title: "From the other project" });

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
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const first = await createTask({ projectId: project.id, title: "First" });
        const second = await createTask({ projectId: project.id, title: "Second" });
        const third = await createTask({ projectId: project.id, title: "Third" });

        await deleteTask(third.id);

        await expect(
            moveTask({ taskId: third.id, afterTaskId: first.id, beforeTaskId: second.id })
        ).rejects.toMatchObject({ message: "moveTask: task not found" });
    });

    it("refuses a deleted task as a neighbour", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const first = await createTask({ projectId: project.id, title: "First" });
        await createTask({ projectId: project.id, title: "Second" });
        const third = await createTask({ projectId: project.id, title: "Third" });

        await deleteTask(first.id);

        await expect(
            moveTask({ taskId: third.id, beforeTaskId: first.id })
        ).rejects.toMatchObject({ message: "moveTask: a neighbour was not found" });
    });

    it("refuses notes on a deleted task", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });

        await deleteTask(task.id);

        await expect(
            setTaskNotes({ taskId: task.id, notes: "Call the printer first" })
        ).rejects.toMatchObject({ message: "setTaskNotes: task not found" });
    });

    it("makes room at the bottom when the last task sits at the integer ceiling", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const first = await createTask({ projectId: project.id, title: "First" });
        const second = await createTask({ projectId: project.id, title: "Second" });

        await pool.query("update tasks set position = 2147483647 where id = $1", [second.id]);

        await moveTask({ taskId: first.id, afterTaskId: second.id });

        const tasks = await listTasks({ projectId: project.id, userId: lead.id });

        expect(tasks.map((task) => task.title)).toEqual(["Second", "First"]);
        expect(tasks[0]?.position).toBe(65536);
        expect(tasks[1]?.position).toBe(131072);
    });

    it("renumbers before adding a task when the last position is at the ceiling", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const first = await createTask({ projectId: project.id, title: "First" });

        await pool.query("update tasks set position = 2147483647 where id = $1", [first.id]);

        await createTask({ projectId: project.id, title: "Second" });

        const tasks = await listTasks({ projectId: project.id, userId: lead.id });

        expect(tasks.map((task) => task.title)).toEqual(["First", "Second"]);
        expect(tasks[0]?.position).toBe(65536);
        expect(tasks[1]?.position).toBe(131072);
    });

    it("refuses a task deleted before it was created", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });

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
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });

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
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const website = await createProject("Website", lead.id);
        const newsletter = await createProject("Newsletter", lead.id);
        const task = await createTask({ projectId: website.id, title: "Draft the homepage" });

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
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const other = await createUser("other@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        await addMember({ projectId: project.id, userId: other.id, role: "associate" });
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });

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
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });

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
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);

        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });

        const membership = await pool.query<{ id: string }>(
            `select id from memberships
            where project_id = $1
            and user_id = $2`,
            [project.id, lead.id]
        );

        expect(task.assignee_membership_id).toBe(membership.rows[0]?.id);
    });

    it("hides the tasks of a project being deleted", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        await createTask({ projectId: project.id, title: "Draft the homepage" });

        await deleteProject(project.id);

        expect(await listTasks({ projectId: project.id, userId: lead.id })).toEqual([]);
    });

    it("refuses to change a task's notes while its project is being deleted", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });

        await deleteProject(project.id);

        await expect(
            setTaskNotes({ taskId: task.id, notes: "Call the printer first" })
        ).rejects.toMatchObject({ message: "setTaskNotes: task not found" });
    });
    
});

describe("subtasks", () => {
    it("refuses more than 50 subtasks on one task", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });

        for (let i = 1; i <= 50; i++) {
            await createSubtask({ taskId: task.id, title: `Step ${i}` });
        }

        await expect(
            createSubtask({ taskId: task.id, title: "Step 51" })
        ).rejects.toMatchObject({ message: "createSubtask: a task can have at most 50 subtasks" });
    });

    it("refuses a subtask due after its task", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({
            projectId: project.id,
            title: "Draft the homepage",
            dueDate: "2026-09-18",
        });

        await expect(
            createSubtask({ taskId: task.id, title: "Too late", dueDate: "2026-09-20" })
        ).rejects.toMatchObject({ message: "a subtask cannot be due after its task" });
    });

    it("creates a subtask under a task", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });

        const subtask = await createSubtask({ taskId: task.id, title: "Write the headline" });

        expect(subtask.title).toBe("Write the headline");
        expect(subtask.task_id).toBe(task.id);
        expect(subtask.position).toBe(65536);
    });

    it("lists a task's subtasks in order", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });

        await createSubtask({ taskId: task.id, title: "First" });
        await createSubtask({ taskId: task.id, title: "Second" });

        const subtasks = await listSubtasks({ taskId: task.id, userId: lead.id });

        expect(subtasks.map((subtask) => subtask.title)).toEqual(["First", "Second"]);
    });

    it("refuses a subtask with a blank title", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });

        await expect(
            createSubtask({ taskId: task.id, title: "   " })
        ).rejects.toMatchObject({ code: "23514", constraint: "subtasks_title_not_blank" });
    });

    it("hides the subtasks of a deleted task", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });
        await createSubtask({ taskId: task.id, title: "Write the headline" });

        await deleteTask(task.id);

        const subtasks = await listSubtasks({ taskId: task.id, userId: lead.id });

        expect(subtasks).toHaveLength(0);
    });

    it("allows a subtask due on the same day as its task", async () => {
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

        expect(subtask.due_date).toBe("2026-09-18");
    });

    it("allows any subtask date when the task has none", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });

        const subtask = await createSubtask({
            taskId: task.id,
            title: "Whenever",
            dueDate: "2027-01-01",
        });

        expect(subtask.due_date).toBe("2027-01-01");
    });

    it("changes a subtask's due date", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({
            projectId: project.id,
            title: "Draft the homepage",
            dueDate: "2026-09-18",
        });
        const subtask = await createSubtask({ taskId: task.id, title: "Write the headline" });

        await setSubtaskDueDate({ subtaskId: subtask.id, dueDate: "2026-09-17" });

        const subtasks = await listSubtasks({ taskId: task.id, userId: lead.id });

        expect(subtasks[0]?.due_date).toBe("2026-09-17");
    });

    it("refuses a changed date that is past its task", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({
            projectId: project.id,
            title: "Draft the homepage",
            dueDate: "2026-09-18",
        });
        const subtask = await createSubtask({ taskId: task.id, title: "Write the headline" });

        await expect(
            setSubtaskDueDate({ subtaskId: subtask.id, dueDate: "2026-09-20" })
        ).rejects.toMatchObject({ message: "a subtask cannot be due after its task" });
    });

    it("clears a subtask's due date", async () => {
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

        await setSubtaskDueDate({ subtaskId: subtask.id, dueDate: null });

        const subtasks = await listSubtasks({ taskId: task.id, userId: lead.id });

        expect(subtasks[0]?.due_date).toBeNull();
    });

    it("clears subtask dates that fall past a task's new date", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({
            projectId: project.id,
            title: "Draft the homepage",
            dueDate: "2026-09-20",
        });
        await createSubtask({ taskId: task.id, title: "Late", dueDate: "2026-09-19" });
        await createSubtask({ taskId: task.id, title: "Early", dueDate: "2026-09-15" });

        const result = await setTaskDueDate({ taskId: task.id, dueDate: "2026-09-16" });

        const subtasks = await listSubtasks({ taskId: task.id, userId: lead.id });

        expect(result.clearedSubtasks).toBe(1);
        expect(subtasks[0]?.due_date).toBeNull();
        expect(subtasks[1]?.due_date).toBe("2026-09-15");
    });

    it("keeps subtask dates when a task's date moves later", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({
            projectId: project.id,
            title: "Draft the homepage",
            dueDate: "2026-09-18",
        });
        await createSubtask({ taskId: task.id, title: "Write the headline", dueDate: "2026-09-17" });

        const result = await setTaskDueDate({ taskId: task.id, dueDate: "2026-09-25" });

        const subtasks = await listSubtasks({ taskId: task.id, userId: lead.id });

        expect(result.clearedSubtasks).toBe(0);
        expect(subtasks[0]?.due_date).toBe("2026-09-17");
    });

    it("keeps subtask dates when a task's date is removed", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({
            projectId: project.id,
            title: "Draft the homepage",
            dueDate: "2026-09-18",
        });
        await createSubtask({ taskId: task.id, title: "Write the headline", dueDate: "2026-09-17" });

        const result = await setTaskDueDate({ taskId: task.id, dueDate: null });

        const subtasks = await listSubtasks({ taskId: task.id, userId: lead.id });

        expect(result.clearedSubtasks).toBe(0);
        expect(subtasks[0]?.due_date).toBe("2026-09-17");
    });
    
    it("saves notes on a subtask", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });
        const subtask = await createSubtask({ taskId: task.id, title: "Write the headline" });

        await setSubtaskNotes({ subtaskId: subtask.id, notes: "Ask marketing for the tagline" });

        const subtasks = await listSubtasks({ taskId: task.id, userId: lead.id });

        expect(subtasks[0]?.notes).toBe("Ask marketing for the tagline");
    });

    it("refuses a subtask under a deleted task", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });

        await deleteTask(task.id);

        await expect(
            createSubtask({ taskId: task.id, title: "Write the headline" })
        ).rejects.toMatchObject({ message: "createSubtask: task not found" });
    });

    it("refuses to change a subtask's date when its task is deleted", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({
            projectId: project.id,
            title: "Draft the homepage",
            dueDate: "2026-09-20",
        });
        const subtask = await createSubtask({ taskId: task.id, title: "Write the headline" });

        await deleteTask(task.id);

        await expect(
            setSubtaskDueDate({ subtaskId: subtask.id, dueDate: "2026-09-18" })
        ).rejects.toMatchObject({ message: "setSubtaskDueDate: subtask not found" });
    });

    it("refuses notes on a subtask whose task was deleted", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });
        const subtask = await createSubtask({ taskId: task.id, title: "Write the headline" });

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
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });
        const subtask = await createSubtask({ taskId: task.id, title: "Write the headline" });

        await pool.query("update subtasks set deleted_at = now() where id = $1", [subtask.id]);

        await expect(
            setSubtaskNotes({ subtaskId: subtask.id, notes: "Ask marketing for the tagline" })
        ).rejects.toMatchObject({ message: "setSubtaskNotes: subtask not found" });
    });

    it("refuses notes for a subtask that does not exist", async () => {
        await expect(
            setSubtaskNotes({ subtaskId: "999999", notes: "Ask marketing for the tagline" })
        ).rejects.toMatchObject({ message: "setSubtaskNotes: subtask not found" });
    });

    it("counts only the subtasks the Lead can see, and still clears the deleted one", async () => {
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
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });
        const subtask = await createSubtask({ taskId: task.id, title: "Write the headline" });

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
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });

        const subtask = await createSubtask({ taskId: task.id, title: "Write the headline" });

        expect(subtask.assignee_membership_id).toBe(task.assignee_membership_id);
        expect(subtask.assignee_membership_id).not.toBeNull();
    });

    it("gives a new subtask no assignee when its task has none", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });

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
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const website = await createProject("Website", lead.id);
        const newsletter = await createProject("Newsletter", lead.id);
        const task = await createTask({ projectId: website.id, title: "Draft the homepage" });
        const subtask = await createSubtask({ taskId: task.id, title: "Write the headline" });

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
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const other = await createUser("other@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        await addMember({ projectId: project.id, userId: other.id, role: "associate" });
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });
        await createSubtask({ taskId: task.id, title: "Write the headline" });

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
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({
            projectId: project.id,
            title: "Draft the homepage",
            dueDate: "2026-10-20",
        });
        const subtask = await createSubtask({ taskId: task.id, title: "Write the headline" });

        await deleteProject(project.id);

        await expect(
            setSubtaskDueDate({ subtaskId: subtask.id, dueDate: "2026-10-19" })
        ).rejects.toMatchObject({ message: "setSubtaskDueDate: subtask not found" });
    });
});

describe("invites", () => {

    it("creates an invite that expires three days out", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        await createUser("ana@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);

        const invite = await createInvite({
            projectId: project.id,
            email: "ana@example.com",
            invitedByUserId: lead.id,
        });

        const days =
            (invite.expires_at.getTime() - invite.created_at.getTime()) / (1000 * 60 * 60 * 24);

        expect(invite.email).toBe("ana@example.com");
        expect(invite.project_id).toBe(project.id);
        expect(invite.invited_by_user_id).toBe(lead.id);
        expect(days).toBeCloseTo(3, 5);
    });

    it("refuses an address with no account", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);

        await expect(
            createInvite({
                projectId: project.id,
                email: "nobody@example.com",
                invitedByUserId: lead.id,
            })
        ).rejects.toMatchObject({ message: "No email found" });
    });

    it("finds the account whatever the case of the address", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        await createUser("ana@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);

        const invite = await createInvite({
            projectId: project.id,
            email: "ANA@EXAMPLE.COM",
            invitedByUserId: lead.id,
        });

        expect(invite.email).toBe("ANA@EXAMPLE.COM");
    });

    it("refuses someone who is already a member", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const other = await createUser("other@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        await addMember({ projectId: project.id, userId: other.id, role: "associate" });

        await expect(
            createInvite({
                projectId: project.id,
                email: "other@example.com",
                invitedByUserId: lead.id,
            })
        ).rejects.toMatchObject({
            message: "createInvite: they are already a member of this project",
        });
    });

    it("replaces an earlier invite to the same address", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        await createUser("ana@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);

        const first = await createInvite({
            projectId: project.id,
            email: "ana@example.com",
            invitedByUserId: lead.id,
        });

        const second = await createInvite({
            projectId: project.id,
            email: "ANA@EXAMPLE.COM",
            invitedByUserId: lead.id,
        });

        const all = await pool.query<{ id: string }>(
            `select id from invites where project_id = $1`,
            [project.id]
        );

        expect(all.rowCount).toBe(1);
        expect(all.rows[0]?.id).toBe(second.id);
        expect(second.id).not.toBe(first.id);
    });

    it("refuses a duplicate invite written straight to the table", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        await createUser("ana@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);

        await createInvite({
            projectId: project.id,
            email: "ana@example.com",
            invitedByUserId: lead.id,
        });

        await expect(
            pool.query(
                `insert into invites (project_id, email, invited_by_user_id, expires_at)
                values ($1, $2, $3, now() + interval '3 days')`,
                [project.id, "Ana@Example.com", lead.id]
            )
        ).rejects.toMatchObject({
            code: "23505",
            constraint: "invites_one_per_project_email_idx",
        });
    });

    it("makes the recipient an associate and destroys the invite", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const invite = await createInvite({
            projectId: project.id,
            email: "ana@example.com",
            invitedByUserId: lead.id,
        });

        const result = await acceptInvite({ inviteId: invite.id, userId: ana.id });

        const projects = await listProjectsForUser(ana.id);
        const role = await pool.query<{ role: string }>(
            `select role from memberships
            where project_id = $1 and user_id = $2 and ended_at is null`,
            [project.id, ana.id]
        );
        const left = await pool.query(`select id from invites where id = $1`, [invite.id]);

        expect(result.projectId).toBe(project.id);
        expect(projects.map((p) => p.id)).toEqual([project.id]);
        expect(role.rows[0]?.role).toBe("associate");
        expect(left.rowCount).toBe(0);
    });

    it("refuses an invite addressed to someone else", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        await createUser("ana@example.com", "Europe/Zagreb");
        const bruno = await createUser("bruno@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const invite = await createInvite({
            projectId: project.id,
            email: "ana@example.com",
            invitedByUserId: lead.id,
        });

        await expect(
            acceptInvite({ inviteId: invite.id, userId: bruno.id })
        ).rejects.toMatchObject({ message: "acceptInvite: invite not found" });

        expect(await listProjectsForUser(bruno.id)).toEqual([]);
    });

    it("refuses an invite that has expired", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const invite = await createInvite({
            projectId: project.id,
            email: "ana@example.com",
            invitedByUserId: lead.id,
        });

        await pool.query(
            `update invites
            set created_at = now() - interval '4 days',
                expires_at = now() - interval '1 day'
            where id = $1`,
            [invite.id]
        );

        await expect(
            acceptInvite({ inviteId: invite.id, userId: ana.id })
        ).rejects.toMatchObject({ message: "acceptInvite: this invite has expired" });

        expect(await listProjectsForUser(ana.id)).toEqual([]);
    });

    it("destroys a declined invite without adding anyone", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const invite = await createInvite({
            projectId: project.id,
            email: "ana@example.com",
            invitedByUserId: lead.id,
        });

        await declineInvite({ inviteId: invite.id, userId: ana.id });

        const left = await pool.query(`select id from invites where id = $1`, [invite.id]);

        expect(left.rowCount).toBe(0);
        expect(await listProjectsForUser(ana.id)).toEqual([]);
    });

    it("lists the invites waiting for a user", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const website = await createProject("Website", lead.id);
        const newsletter = await createProject("Newsletter", lead.id);

        await createInvite({
            projectId: website.id,
            email: "ANA@EXAMPLE.COM",
            invitedByUserId: lead.id,
        });
        await createInvite({
            projectId: newsletter.id,
            email: "ana@example.com",
            invitedByUserId: lead.id,
        });

        const waiting = await listInvitesForUser(ana.id);

        expect(waiting.map((i) => i.project_id)).toEqual([website.id, newsletter.id]);
    });

    it("leaves an expired invite out of the list", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const invite = await createInvite({
            projectId: project.id,
            email: "ana@example.com",
            invitedByUserId: lead.id,
        });

        await pool.query(
            `update invites
            set created_at = now() - interval '4 days',
                expires_at = now() - interval '1 day'
            where id = $1`,
            [invite.id]
        );

        expect(await listInvitesForUser(ana.id)).toEqual([]);
    });
});