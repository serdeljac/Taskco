import { describe, it, expect } from "vitest";
import { pool } from "../db.js";
import {
    createUser,
    createProject,
    addMember,
    listProjectsForUser,
    removeMember,
    createTask,
    createSubtask,
    setTaskAssignee,
    listTasks,
    deleteProject,
    transferLeadership,
} from "../queries.js";


describe("memberships", () => {
    it("refuses to add the same person to a project twice", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const other = await createUser("other@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);

        //TEST
        await addMember({ projectId: project.id, userId: other.id, role: "associate" });
        await expect(
            addMember({ projectId: project.id, userId: other.id, role: "associate" })
        ).rejects.toMatchObject({ code: "23505" });
    });

    it("returns only the projects a user belongs to", async () => {
        //CREATE
        const alice = await createUser("alice@example.com", "Europe/Zagreb");
        const bob = await createUser("bob@example.com", "Europe/Zagreb");
        const aliceProject = await createProject("Alice's work", alice.id);
        await createProject("Bob's work", bob.id);

        //TEST
        const projects = await listProjectsForUser(alice.id);

        expect(projects).toHaveLength(1);
        expect(projects[0]?.id).toBe(aliceProject.id);
    });

    it("stops listing a project once the member has left", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const other = await createUser("other@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        await addMember({ projectId: project.id, userId: other.id, role: "associate" });

        //TEST
        expect(await listProjectsForUser(other.id)).toHaveLength(1);

        await removeMember({ projectId: project.id, userId: other.id });
        expect(await listProjectsForUser(other.id)).toHaveLength(0);
    });

    it("refuses a second lead on the same project", async () => {
        //TEST
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const other = await createUser("other@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);

        //CREATE
        await expect(
            addMember({ projectId: project.id, userId: other.id, role: "lead" })
        ).rejects.toMatchObject({ code: "23505", constraint: "memberships_one_lead_idx", });
    });

    it("refuses to remove the project's lead", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);

        //TEST
        await expect(
            removeMember({ projectId: project.id, userId: lead.id })
        ).rejects.toMatchObject({ message: "Cannot remove the project's lead" });
    });

    it("refuses to remove someone who is not a member", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const stranger = await createUser("stranger@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);

        //TEST
        await expect(
            removeMember({ projectId: project.id, userId: stranger.id })
        ).rejects.toMatchObject({ message: "removeMember: membership not found" });
    });

    it("refuses to remove the same member twice", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const other = await createUser("other@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        await addMember({ projectId: project.id, userId: other.id, role: "associate" });

        //TEST
        await removeMember({ projectId: project.id, userId: other.id });
        await expect(
            removeMember({ projectId: project.id, userId: other.id })
        ).rejects.toMatchObject({ message: "removeMember: membership not found" });
    });

    it("refuses a membership that ended before it began", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const other = await createUser("other@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        await addMember({ projectId: project.id, userId: other.id, role: "associate" });

        //TEST
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
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const other = await createUser("other@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        await addMember({ projectId: project.id, userId: other.id, role: "associate" });
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });
        await createSubtask({ taskId: task.id, title: "Write the headline" });

        //TEST
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
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const other = await createUser("other@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        await addMember({ projectId: project.id, userId: other.id, role: "associate" });
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });
        const subtask = await createSubtask({ taskId: task.id, title: "Write the headline" });

        //TEST
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
        const membershipId = membership.rows[0]?.id ?? null;

        await setTaskAssignee({ taskId: task.id, membershipId });
        const tasks = await listTasks({ projectId: project.id, userId: lead.id });
        expect(tasks[0]?.assignee_membership_id).toBe(membershipId);
    });

    it("leaves a task unassigned when the assignee is set to null", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });

        //TEST
        expect(task.assignee_membership_id).not.toBeNull();
        await setTaskAssignee({ taskId: task.id, membershipId: null });
        const tasks = await listTasks({ projectId: project.id, userId: lead.id });
        expect(tasks[0]?.assignee_membership_id).toBeNull();
    });

    it("refuses an assignee who has left the project", async () => {
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
        const membershipId = membership.rows[0]?.id ?? null;

        await removeMember({ projectId: project.id, userId: other.id });
        await expect(
            setTaskAssignee({ taskId: task.id, membershipId })
        ).rejects.toMatchObject({
            message: "the assignee must be a current member of the project",
        });
    });

    it("refuses an assignee from another project", async () => {
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
            setTaskAssignee({ taskId: task.id, membershipId: elsewhere.rows[0]?.id ?? null })
        ).rejects.toMatchObject({
            message: "the assignee must be a current member of the project",
        });
    });

    it("refuses to add a member while the project is being deleted", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const other = await createUser("other@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);

        //TEST
        await deleteProject(project.id);
        await expect(
            addMember({ projectId: project.id, userId: other.id, role: "associate" })
        ).rejects.toMatchObject({
            message: "addMember: project not found, or being deleted",
        });

        const members = await pool.query(
            `select id from memberships where project_id = $1`,
            [project.id]
        );
        expect(members.rowCount).toBe(1);
    });

    it("refuses to remove a member while the project is being deleted", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const other = await createUser("other@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        await addMember({ projectId: project.id, userId: other.id, role: "associate" });

        //TEST
        await deleteProject(project.id);
        await expect(
            removeMember({ projectId: project.id, userId: other.id })
        ).rejects.toMatchObject({ message: "the project is being deleted" });
        const still = await pool.query(
            `select id from memberships
            where project_id = $1 and user_id = $2 and ended_at is null`,
            [project.id, other.id]
        );
        expect(still.rowCount).toBe(1);
    });

    it("hands leadership to a member, and keeps the old Lead as an associate", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        await addMember({ projectId: project.id, userId: ana.id, role: "associate" });

        //TEST
        await transferLeadership({ projectId: project.id, toUserId: ana.id, outgoing: "stay" });
        const roles = await pool.query<{ user_id: string; role: string }>(
            `select user_id, role from memberships
            where project_id = $1 and ended_at is null
            order by user_id`,
            [project.id]
        );
        expect(roles.rows).toEqual([
            { user_id: lead.id, role: "associate" },
            { user_id: ana.id, role: "lead" },
        ]);
    });

    it("lets the old Lead leave in the same transfer, and empties their assignments", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        await addMember({ projectId: project.id, userId: ana.id, role: "associate" });
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });

        //TEST
        await transferLeadership({ projectId: project.id, toUserId: ana.id, outgoing: "leave" });
        const roles = await pool.query<{ user_id: string; role: string }>(
            `select user_id, role from memberships
            where project_id = $1 and ended_at is null`,
            [project.id]
        );
        const after = await pool.query<{ assignee_membership_id: string | null }>(
            `select assignee_membership_id from tasks where id = $1`,
            [task.id]
        );

        expect(roles.rows).toEqual([{ user_id: ana.id, role: "lead" }]);
        expect(after.rows[0]?.assignee_membership_id).toBeNull();
    });

    it("refuses to make someone Lead who is not a member", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const stranger = await createUser("stranger@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);

        //TEST
        await expect(
            transferLeadership({ projectId: project.id, toUserId: stranger.id, outgoing: "stay" })
        ).rejects.toMatchObject({
            message: "transferLeadership: the new Lead must be a current member of the project",
        });

        const roles = await pool.query<{ user_id: string; role: string }>(
            `select user_id, role from memberships
            where project_id = $1 and ended_at is null`,
            [project.id]
        );

        expect(roles.rows).toEqual([{ user_id: lead.id, role: "lead" }]);
    });

    it("refuses a transfer while the project is being deleted", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        await addMember({ projectId: project.id, userId: ana.id, role: "associate" });

        //TEST
        await deleteProject(project.id);
        await expect(
            transferLeadership({ projectId: project.id, toUserId: ana.id, outgoing: "stay" })
        ).rejects.toMatchObject({ message: "the project is being deleted" });

        const roles = await pool.query<{ user_id: string; role: string }>(
            `select user_id, role from memberships
            where project_id = $1 and ended_at is null
            order by user_id`,
            [project.id]
        );

        expect(roles.rows).toEqual([
            { user_id: lead.id, role: "lead" },
            { user_id: ana.id, role: "associate" },
        ]);
    });

});