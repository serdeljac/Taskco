import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../app.js";
import { cookieFor } from "../testing/session.js";
import { pool } from "../db.js";
import { createUser, createProject, createInvite, addMember, listInvitesForUser, listProjectsForUser, deleteProject } from "../queries.js";


describe("GET /invites", () => {
    it("lists the invites addressed to the asker", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const ben = await createUser("ben@example.com", "Europe/Zagreb");
        const project = await createProject("Website", ana.id);
        await createInvite({
            projectId: project.id,
            email: "ben@example.com",
            invitedByUserId: ana.id,
        });

        //TEST
        const response = await request(app)
            .get("/invites")
            .set("Cookie", await cookieFor(ben));

        expect(response.status).toBe(200);
        expect(response.body.invites).toHaveLength(1);
        expect(response.body.invites[0].project_id).toBe(project.id);
    });

    it("does not show an invite to the person who sent it", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        await createUser("ben@example.com", "Europe/Zagreb");
        const project = await createProject("Website", ana.id);
        await createInvite({
            projectId: project.id,
            email: "ben@example.com",
            invitedByUserId: ana.id,
        });

        //TEST
        const response = await request(app)
            .get("/invites")
            .set("Cookie", await cookieFor(ana));

        expect(response.status).toBe(200);
        expect(response.body.invites).toHaveLength(0);
    });

    it("refuses a request that does not say who is asking", async () => {
        //TEST
        const response = await request(app).get("/invites");

        expect(response.status).toBe(401);
    });
});

describe("POST /projects/:projectId/invites", () => {
    it("invites someone by email, and the invite reaches them", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const ben = await createUser("ben@example.com", "Europe/Zagreb");
        const project = await createProject("Website", ana.id);

        //TEST
        const response = await request(app)
            .post(`/projects/${project.id}/invites`)
            .set("Cookie", await cookieFor(ana))
            .send({ email: "ben@example.com" });

        expect(response.status).toBe(201);
        expect(response.body.invite).toMatchObject({ project_id: project.id, invited_by_user_id: ana.id });
        expect(await listInvitesForUser(ben.id)).toHaveLength(1);
    });

    it("finds the account whatever the case of the address", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const ben = await createUser("ben@example.com", "Europe/Zagreb");
        const project = await createProject("Website", ana.id);

        //TEST
        const response = await request(app)
            .post(`/projects/${project.id}/invites`)
            .set("Cookie", await cookieFor(ana))
            .send({ email: "Ben@Example.com" });

        expect(response.status).toBe(201);
        expect(await listInvitesForUser(ben.id)).toHaveLength(1);
    });

    it("answers 409 when no account has that address", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const project = await createProject("Website", ana.id);

        //TEST
        const response = await request(app)
            .post(`/projects/${project.id}/invites`)
            .set("Cookie", await cookieFor(ana))
            .send({ email: "nobody@example.com" });

        expect(response.status).toBe(409);
        expect(response.body).toEqual({ error: "No email found" });
    });

    it("answers 409 when they are already a member", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const ben = await createUser("ben@example.com", "Europe/Zagreb");
        const project = await createProject("Website", ana.id);
        await addMember({ projectId: project.id, userId: ben.id, role: "associate" });

        //TEST
        const response = await request(app)
            .post(`/projects/${project.id}/invites`)
            .set("Cookie", await cookieFor(ana))
            .send({ email: "ben@example.com" });

        expect(response.status).toBe(409);
        expect(response.body).toEqual({ error: "they are already a member of this project" });
    });

    it("refuses an address that is not an email", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const project = await createProject("Website", ana.id);

        //TEST
        const response = await request(app)
            .post(`/projects/${project.id}/invites`)
            .set("Cookie", await cookieFor(ana))
            .send({ email: "ben at example" });

        expect(response.status).toBe(400);
    });

    it("refuses a body that names who is inviting", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const ben = await createUser("ben@example.com", "Europe/Zagreb");
        const project = await createProject("Website", ana.id);

        //TEST
        const response = await request(app)
            .post(`/projects/${project.id}/invites`)
            .set("Cookie", await cookieFor(ana))
            .send({ email: "ben@example.com", invitedByUserId: ben.id });

        expect(response.status).toBe(400);
        expect(await listInvitesForUser(ben.id)).toHaveLength(0);
    });

    it("answers 403 to an Associate", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const ben = await createUser("ben@example.com", "Europe/Zagreb");
        const cara = await createUser("cara@example.com", "Europe/Zagreb");
        const project = await createProject("Website", ana.id);
        await addMember({ projectId: project.id, userId: ben.id, role: "associate" });

        //TEST
        const response = await request(app)
            .post(`/projects/${project.id}/invites`)
            .set("Cookie", await cookieFor(ben))
            .send({ email: "cara@example.com" });

        expect(response.status).toBe(403);
        expect(await listInvitesForUser(cara.id)).toHaveLength(0);
    });

    it("refuses a request that does not say who is asking", async () => {
        //TEST
        const response = await request(app)
            .post("/projects/1/invites")
            .send({ email: "ben@example.com" });

        expect(response.status).toBe(401);
    });
});


describe("POST /invites/:inviteId/accept", () => {
    it("makes the recipient an Associate, and uses up the invite", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const ben = await createUser("ben@example.com", "Europe/Zagreb");
        const project = await createProject("Website", ana.id);
        const invite = await createInvite({ projectId: project.id, email: "ben@example.com", invitedByUserId: ana.id });

        //TEST
        const response = await request(app)
            .post(`/invites/${invite.id}/accept`)
            .set("Cookie", await cookieFor(ben));

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ projectId: project.id });
        expect(await listProjectsForUser(ben.id)).toMatchObject([{ id: project.id, role: "associate" }]);
        expect(await listInvitesForUser(ben.id)).toHaveLength(0);
    });

    it("answers 404 to someone the invite is not addressed to", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const ben = await createUser("ben@example.com", "Europe/Zagreb");
        const cara = await createUser("cara@example.com", "Europe/Zagreb");
        const project = await createProject("Website", ana.id);
        const invite = await createInvite({ projectId: project.id, email: "ben@example.com", invitedByUserId: ana.id });

        //TEST
        const response = await request(app)
            .post(`/invites/${invite.id}/accept`)
            .set("Cookie", await cookieFor(cara));

        expect(response.status).toBe(404);
        expect(response.body).toEqual({ error: "Not found" });
        expect(await listProjectsForUser(cara.id)).toHaveLength(0);
        expect(await listInvitesForUser(ben.id)).toHaveLength(1);
    });

    it("answers 409 when the invite has expired", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const ben = await createUser("ben@example.com", "Europe/Zagreb");
        const project = await createProject("Website", ana.id);
        const invite = await createInvite({ projectId: project.id, email: "ben@example.com", invitedByUserId: ana.id });
        await pool.query(
            "update invites set created_at = now() - interval '4 days', expires_at = now() - interval '1 day' where id = $1",
            [invite.id]
        );

        //TEST
        const response = await request(app)
            .post(`/invites/${invite.id}/accept`)
            .set("Cookie", await cookieFor(ben));

        expect(response.status).toBe(409);
        expect(response.body).toEqual({ error: "this invite has expired" });
        expect(await listProjectsForUser(ben.id)).toHaveLength(0);
    });

    it("answers 409 when the project is being deleted", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const ben = await createUser("ben@example.com", "Europe/Zagreb");
        const project = await createProject("Website", ana.id);
        const invite = await createInvite({ projectId: project.id, email: "ben@example.com", invitedByUserId: ana.id });
        await deleteProject(project.id);

        //TEST
        const response = await request(app)
            .post(`/invites/${invite.id}/accept`)
            .set("Cookie", await cookieFor(ben));

        expect(response.status).toBe(409);
        expect(response.body).toEqual({ error: "the project is being deleted" });
    });

    it("refuses a request that does not say who is asking", async () => {
        //TEST
        const response = await request(app).post("/invites/1/accept");

        expect(response.status).toBe(401);
    });
});


describe("DELETE /invites/:inviteId", () => {
    it("declines an invite, which disappears", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const ben = await createUser("ben@example.com", "Europe/Zagreb");
        const project = await createProject("Website", ana.id);
        const invite = await createInvite({ projectId: project.id, email: "ben@example.com", invitedByUserId: ana.id });

        //TEST
        const response = await request(app)
            .delete(`/invites/${invite.id}`)
            .set("Cookie", await cookieFor(ben));

        expect(response.status).toBe(204);
        expect(await listInvitesForUser(ben.id)).toHaveLength(0);
        expect(await listProjectsForUser(ben.id)).toHaveLength(0);
    });

    it("answers 404 to someone the invite is not addressed to, and leaves it", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const ben = await createUser("ben@example.com", "Europe/Zagreb");
        const project = await createProject("Website", ana.id);
        const invite = await createInvite({ projectId: project.id, email: "ben@example.com", invitedByUserId: ana.id });

        //TEST
        const response = await request(app)
            .delete(`/invites/${invite.id}`)
            .set("Cookie", await cookieFor(ana));

        expect(response.status).toBe(404);
        expect(await listInvitesForUser(ben.id)).toHaveLength(1);
    });

    it("refuses a request that does not say who is asking", async () => {
        //TEST
        const response = await request(app).delete("/invites/1");

        expect(response.status).toBe(401);
    });
});
