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

    //When you create a task, the status is set to 'not started' and no priority set
    it("starts a new task as not started, with no priority", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);

        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });

        expect(task.status).toBe("not_started");
        expect(task.priority).toBeNull();
    });

    //Tries to save a status that isn't on the list; passes only if the database refuses it
    it("refuses a status that is not on the list", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });

        await expect(
            pool.query("update tasks set status = 'done' where id = $1", [task.id])
        ).rejects.toMatchObject({ code: "23514", constraint: "tasks_status_valid" });
    });

    //Same as above, but for priority
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

    //Make sure on creation, the due date is empty (null) if not set
    it("leaves the due date empty when none is given", async () => {
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);

        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });

        expect(task.due_date).toBeNull();
    });

    //Delete a task
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
});