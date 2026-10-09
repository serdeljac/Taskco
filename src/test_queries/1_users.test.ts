import { describe, it, expect } from "vitest";
import { pool } from "../db.js";
import {
    createUser,
    createProject,
    deleteAccount,
    addMember,
    createTask,
    setTaskAssignee,
    listProjectsForUser,
    restoreProject,
    deleteProject,
    reopenAccount,
    purgeDeletedProjects,
    purgeDeletedAccounts,
} from "../queries.js";


describe("users", () => {
    it("returns a row the database generated", async () => {
        //CREATE
        const user = await createUser("someone@example.com", "Europe/Zagreb");

        //TEST
        expect(user.email).toBe("someone@example.com");
        expect(user.timezone).toBe("Europe/Zagreb");
        expect(typeof user.id).toBe("string");
        expect(user.created_at).toBeInstanceOf(Date);
    });

    it("refuses two users with the same email in different cases", async () => {
        //CREATE
        await createUser("Person@example.com", "Europe/Zagreb");

        //TEST
        await expect(
            createUser("person@example.com", "Europe/Zagreb")
        ).rejects.toMatchObject({ code: "23505" });
    });

    it("refuses a timezone Postgres does not know", async () => {
        //TEST
        await expect(
            createUser("mars@example.com", "Mars/Olympus")
        ).rejects.toMatchObject({ code: "23514", constraint: "users_timezone_known" });
    });

    it("puts the projects an account leads into delete mode, on the account's date", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);

        //TEST
        await deleteAccount(lead.id);
        const dates = await pool.query<{ same: boolean }>(
            `select p.deletion_scheduled_at = u.deletion_scheduled_at as same
            from projects p, users u
            where p.id = $1 and u.id = $2`,
            [project.id, lead.id]
        );
        expect(dates.rows[0]?.same).toBe(true);
    });

    it("ends an account's memberships in other projects, and empties its assignments", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const member = await createUser("member@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        await addMember({ projectId: project.id, userId: member.id, role: "associate" });
        const task = await createTask({ projectId: project.id, title: "Draft the homepage" });

        //TEST
        const membership = await pool.query<{ id: string }>(
            `select id from memberships where project_id = $1 and user_id = $2`,
            [project.id, member.id]
        );

        await setTaskAssignee({ taskId: task.id, membershipId: membership.rows[0]?.id ?? null });
        await deleteAccount(member.id);

        const after = await pool.query<{ assignee_membership_id: string | null }>(
            `select assignee_membership_id from tasks where id = $1`,
            [task.id]
        );

        expect(await listProjectsForUser(member.id)).toEqual([]);
        expect(after.rows[0]?.assignee_membership_id).toBeNull();
    });

    it("refuses to restore a project while its Lead's account is being deleted", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);

        //TEST
        await deleteAccount(lead.id);
        await expect(restoreProject(project.id)).rejects.toMatchObject({
            message: "restoreProject: project not found, not inside its deletion window, or its Lead's account is being deleted",
        });

        const { rows } = await pool.query<{ deletion_scheduled_at: Date | null }>(
            `select deletion_scheduled_at from projects where id = $1`, [project.id]
        );

        expect(rows[0]?.deletion_scheduled_at).not.toBeNull();
    });

    it("reopens an account, and brings back every project it still leads", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const newsletter = await createProject("Newsletter", lead.id);
        const website = await createProject("Website", lead.id);

        //TEST
        await deleteProject(newsletter.id);
        await deleteAccount(lead.id);
        await reopenAccount(lead.id);

        const left = await pool.query(
            `select id from projects where deletion_scheduled_at is not null
            union all
            select id from users where deletion_scheduled_at is not null`
        );

        expect(left.rowCount).toBe(0);
        expect((await listProjectsForUser(lead.id)).map((p) => p.id)).toEqual([
            newsletter.id,
            website.id,
        ]);
    });

    it("refuses to reopen an account past its deletion date", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        await createProject("Website", lead.id);

        //TEST
        await deleteAccount(lead.id);
        await pool.query(`update users set deletion_scheduled_at = now() - interval '1 day'`);

        await expect(reopenAccount(lead.id)).rejects.toMatchObject({
            message: "reopenAccount: account not found, or not inside its deletion window",
        });
    });

    it("purges an account past its date once the projects it led are gone", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        await createProject("Website", lead.id);

        //TEST
        await deleteAccount(lead.id);
        await pool.query(`update projects set deletion_scheduled_at = now() - interval '1 day'`);
        await pool.query(`update users set deletion_scheduled_at = now() - interval '1 day'`);
        await purgeDeletedProjects();

        const { purged } = await purgeDeletedAccounts();
        const users = await pool.query(`select id from users`);

        expect(purged).toBe(1);
        expect(users.rowCount).toBe(0);
    });

    it("keeps an account past its date while it still leads a project", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);

        //TEST
        await deleteAccount(lead.id);
        await pool.query(`update users set deletion_scheduled_at = now() - interval '1 day'`);

        const { purged } = await purgeDeletedAccounts();
        const leads = await pool.query(
            `select id from memberships
            where project_id = $1 and role = 'lead' and ended_at is null`,
            [project.id]
        );

        expect(purged).toBe(0);
        expect(leads.rowCount).toBe(1);
    });

    it("ends an account's membership even in a project being deleted", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        await addMember({ projectId: project.id, userId: ana.id, role: "associate" });

        //TEST
        await deleteProject(project.id);
        await deleteAccount(ana.id);

        const membership = await pool.query<{ ended: boolean }>(
            `select ended_at is not null as ended
            from memberships
            where project_id = $1 and user_id = $2`,
            [project.id, ana.id]
        );

        expect(membership.rows).toEqual([{ ended: true }]);
    });
    
});