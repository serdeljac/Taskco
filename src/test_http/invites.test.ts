import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../app.js";
import { createUser, createProject, createInvite, addMember, listInvitesForUser } from "../queries.js";


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
            .set("X-User-Id", ben.id);

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
            .set("X-User-Id", ana.id);

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
            .set("X-User-Id", ana.id)
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
            .set("X-User-Id", ana.id)
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
            .set("X-User-Id", ana.id)
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
            .set("X-User-Id", ana.id)
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
            .set("X-User-Id", ana.id)
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
            .set("X-User-Id", ana.id)
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
            .set("X-User-Id", ben.id)
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
