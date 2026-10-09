import { describe, it, expect } from "vitest";
import { pool } from "../db.js";
import {
    createUser,
    createProject,
    createInvite,
    addMember,
    acceptInvite,
    listProjectsForUser,
    declineInvite,
    listInvitesForUser,
    deleteProject,
    removeMember,
} from "../queries.js";


describe("invites", () => {
    it("creates an invite that expires three days out", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        await createUser("ana@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const invite = await createInvite({
            projectId: project.id,
            email: "ana@example.com",
            invitedByUserId: lead.id,
        });

        //TEST
        const days = (invite.expires_at.getTime() - invite.created_at.getTime()) / (1000 * 60 * 60 * 24);
        expect(invite.email).toBe("ana@example.com");
        expect(invite.project_id).toBe(project.id);
        expect(invite.invited_by_user_id).toBe(lead.id);
        expect(days).toBeCloseTo(3, 5);
    });

    it("refuses an address with no account", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);

        //TEST
        await expect(
            createInvite({
                projectId: project.id,
                email: "nobody@example.com",
                invitedByUserId: lead.id,
            })
        ).rejects.toMatchObject({ message: "No email found" });
    });

    it("finds the account whatever the case of the address", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        await createUser("ana@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const invite = await createInvite({
            projectId: project.id,
            email: "ANA@EXAMPLE.COM",
            invitedByUserId: lead.id,
        });

        //TEST
        expect(invite.email).toBe("ANA@EXAMPLE.COM");
    });

    it("refuses someone who is already a member", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const other = await createUser("other@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        await addMember({ projectId: project.id, userId: other.id, role: "associate" });

        //TEST
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
        //CREATE
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

        //TEST
        const all = await pool.query<{ id: string }>(
            `select id from invites where project_id = $1`,
            [project.id]
        );
        expect(all.rowCount).toBe(1);
        expect(all.rows[0]?.id).toBe(second.id);
        expect(second.id).not.toBe(first.id);
    });

    it("refuses a duplicate invite written straight to the table", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        await createUser("ana@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        await createInvite({
            projectId: project.id,
            email: "ana@example.com",
            invitedByUserId: lead.id,
        });

        //TEST
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
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const invite = await createInvite({
            projectId: project.id,
            email: "ana@example.com",
            invitedByUserId: lead.id,
        });

        //TEST
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
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        await createUser("ana@example.com", "Europe/Zagreb");
        const bruno = await createUser("bruno@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const invite = await createInvite({
            projectId: project.id,
            email: "ana@example.com",
            invitedByUserId: lead.id,
        });

        //TEST
        await expect(
            acceptInvite({ inviteId: invite.id, userId: bruno.id })
        ).rejects.toMatchObject({ message: "acceptInvite: invite not found" });

        expect(await listProjectsForUser(bruno.id)).toEqual([]);
    });

    it("refuses an invite that has expired", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const invite = await createInvite({
            projectId: project.id,
            email: "ana@example.com",
            invitedByUserId: lead.id,
        });

        //TEST
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
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const invite = await createInvite({
            projectId: project.id,
            email: "ana@example.com",
            invitedByUserId: lead.id,
        });

        //TEST
        await declineInvite({ inviteId: invite.id, userId: ana.id });
        const left = await pool.query(`select id from invites where id = $1`, [invite.id]);
        expect(left.rowCount).toBe(0);
        expect(await listProjectsForUser(ana.id)).toEqual([]);
    });

    it("lists the invites waiting for a user", async () => {
        //CREATE
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

        //TEST
        const waiting = await listInvitesForUser(ana.id);
        expect(waiting.map((i) => i.project_id)).toEqual([website.id, newsletter.id]);
    });

    it("leaves an expired invite out of the list", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const invite = await createInvite({
            projectId: project.id,
            email: "ana@example.com",
            invitedByUserId: lead.id,
        });

        //TEST
        await pool.query(
            `update invites
            set created_at = now() - interval '4 days',
                expires_at = now() - interval '1 day'
            where id = $1`,
            [invite.id]
        );
        expect(await listInvitesForUser(ana.id)).toEqual([]);
    });

    it("refuses to send an invite while the project is being deleted", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        await createUser("ana@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);

        //TEST
        await deleteProject(project.id);
        await expect(
            createInvite({
                projectId: project.id,
                email: "ana@example.com",
                invitedByUserId: lead.id,
            })
        ).rejects.toMatchObject({ message: "the project is being deleted" });
        const invites = await pool.query(`select id from invites where project_id = $1`, [
            project.id,
        ]);
        expect(invites.rowCount).toBe(0);
    });

    it("refuses an invite accepted after the project starts being deleted", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const invite = await createInvite({
            projectId: project.id,
            email: "ana@example.com",
            invitedByUserId: lead.id,
        });

        //TEST
        await deleteProject(project.id);
        await expect(
            acceptInvite({ inviteId: invite.id, userId: ana.id })
        ).rejects.toMatchObject({ message: "the project is being deleted" });

        expect(await listProjectsForUser(ana.id)).toEqual([]);
        const left = await pool.query(`select id from invites where id = $1`, [invite.id]);
        expect(left.rowCount).toBe(1);
    });

    it("refuses an invite when the recipient has become a member since", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);
        const invite = await createInvite({
            projectId: project.id,
            email: "ana@example.com",
            invitedByUserId: lead.id,
        });
        
        //TEST
        await addMember({ projectId: project.id, userId: ana.id, role: "associate" });
        await expect(
            acceptInvite({ inviteId: invite.id, userId: ana.id })
        ).rejects.toMatchObject({
            message: "acceptInvite: you are already a member of this project",
        });

        const active = await pool.query(
            `select id from memberships
            where project_id = $1 and user_id = $2 and ended_at is null`,
            [project.id, ana.id]
        );
        const left = await pool.query(`select id from invites where id = $1`, [invite.id]);

        expect(active.rowCount).toBe(1);
        expect(left.rowCount).toBe(1);
    });

    it("lets someone who left the project accept a new invite", async () => {
        //CREATE
        const lead = await createUser("lead@example.com", "Europe/Zagreb");
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const project = await createProject("Website", lead.id);

        //TEST
        await addMember({ projectId: project.id, userId: ana.id, role: "associate" });
        await removeMember({ projectId: project.id, userId: ana.id });
        const invite = await createInvite({
            projectId: project.id,
            email: "ana@example.com",
            invitedByUserId: lead.id,
        });
        await acceptInvite({ inviteId: invite.id, userId: ana.id });

        const memberships = await pool.query<{ ended: boolean }>(
            `select ended_at is not null as ended
            from memberships
            where project_id = $1 and user_id = $2
            order by id`,
            [project.id, ana.id]
        );

        expect(memberships.rows.map((m) => m.ended)).toEqual([true, false]);
    });
});