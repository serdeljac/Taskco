import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../app.js";
import { cookieFor } from "../testing/session.js";
import { createUser, createProject, addMember, listMembers, deleteProject } from "../queries.js";


describe("GET /projects/:projectId/members", () => {
    it("lists the project's members to a member", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const ben = await createUser("ben@example.com", "Europe/Zagreb");
        const project = await createProject("Website", ana.id);
        await addMember({ projectId: project.id, userId: ben.id, role: "associate" });

        //TEST
        const response = await request(app)
            .get(`/projects/${project.id}/members`)
            .set("Cookie", await cookieFor(ben));

        expect(response.status).toBe(200);
        expect(response.body.members).toMatchObject([
            { user_id: ana.id, email: "ana@example.com", role: "lead" },
            { user_id: ben.id, email: "ben@example.com", role: "associate" },
        ]);
    });

    it("answers 404 to someone who is not in the project", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const cara = await createUser("cara@example.com", "Europe/Zagreb");
        const project = await createProject("Website", ana.id);

        //TEST
        const response = await request(app)
            .get(`/projects/${project.id}/members`)
            .set("Cookie", await cookieFor(cara));

        expect(response.status).toBe(404);
        expect(response.body).toEqual({ error: "Not found" });
    });

    it("refuses a request that does not say who is asking", async () => {
        //TEST
        const response = await request(app).get("/projects/1/members");

        expect(response.status).toBe(401);
    });
});


describe("DELETE /projects/:projectId/members/:userId", () => {
    it("lets the Lead remove an Associate", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const ben = await createUser("ben@example.com", "Europe/Zagreb");
        const project = await createProject("Website", ana.id);
        await addMember({ projectId: project.id, userId: ben.id, role: "associate" });

        //TEST
        const response = await request(app)
            .delete(`/projects/${project.id}/members/${ben.id}`)
            .set("Cookie", await cookieFor(ana));

        expect(response.status).toBe(204);

        const members = await listMembers({ projectId: project.id, userId: ana.id });
        expect(members.map((m) => m.user_id)).toEqual([ana.id]);
    });

    it("lets an Associate leave", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const ben = await createUser("ben@example.com", "Europe/Zagreb");
        const project = await createProject("Website", ana.id);
        await addMember({ projectId: project.id, userId: ben.id, role: "associate" });

        //TEST
        const response = await request(app)
            .delete(`/projects/${project.id}/members/${ben.id}`)
            .set("Cookie", await cookieFor(ben));

        expect(response.status).toBe(204);

        const members = await listMembers({ projectId: project.id, userId: ana.id });
        expect(members.map((m) => m.user_id)).toEqual([ana.id]);
    });

    it("answers 403 to an Associate removing someone else", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const ben = await createUser("ben@example.com", "Europe/Zagreb");
        const cara = await createUser("cara@example.com", "Europe/Zagreb");
        const project = await createProject("Website", ana.id);
        await addMember({ projectId: project.id, userId: ben.id, role: "associate" });
        await addMember({ projectId: project.id, userId: cara.id, role: "associate" });

        //TEST
        const response = await request(app)
            .delete(`/projects/${project.id}/members/${cara.id}`)
            .set("Cookie", await cookieFor(ben));

        expect(response.status).toBe(403);
        expect(await listMembers({ projectId: project.id, userId: ana.id })).toHaveLength(3);
    });

    it("answers 409 to the Lead removing themselves", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const project = await createProject("Website", ana.id);

        //TEST
        const response = await request(app)
            .delete(`/projects/${project.id}/members/${ana.id}`)
            .set("Cookie", await cookieFor(ana));

        expect(response.status).toBe(409);
        expect(response.body).toEqual({ error: "Cannot remove the project's lead" });
    });

    it("answers 409 to the Lead while the project is being deleted", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const ben = await createUser("ben@example.com", "Europe/Zagreb");
        const project = await createProject("Website", ana.id);
        await addMember({ projectId: project.id, userId: ben.id, role: "associate" });
        await deleteProject(project.id);

        //TEST
        const response = await request(app)
            .delete(`/projects/${project.id}/members/${ben.id}`)
            .set("Cookie", await cookieFor(ana));

        expect(response.status).toBe(409);
        expect(response.body).toEqual({ error: "the project is being deleted" });
    });

    it("answers 404 for someone who is not a member", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const cara = await createUser("cara@example.com", "Europe/Zagreb");
        const project = await createProject("Website", ana.id);

        //TEST
        const response = await request(app)
            .delete(`/projects/${project.id}/members/${cara.id}`)
            .set("Cookie", await cookieFor(ana));

        expect(response.status).toBe(404);
        expect(response.body).toEqual({ error: "Not found" });
    });

    it("answers 404 for a user id that is not a number, before it reaches the database", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const project = await createProject("Website", ana.id);

        //TEST
        const response = await request(app)
            .delete(`/projects/${project.id}/members/abc`)
            .set("Cookie", await cookieFor(ana));

        expect(response.status).toBe(404);
        expect(response.body).toEqual({ error: "Not found" });
    });

    it("refuses a request that does not say who is asking", async () => {
        //TEST
        const response = await request(app).delete("/projects/1/members/2");

        expect(response.status).toBe(401);
    });
});


describe("POST /projects/:projectId/transfer", () => {
    it("hands the project to a member, and keeps the old Lead as an Associate", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const ben = await createUser("ben@example.com", "Europe/Zagreb");
        const project = await createProject("Website", ana.id);
        await addMember({ projectId: project.id, userId: ben.id, role: "associate" });

        //TEST
        const response = await request(app)
            .post(`/projects/${project.id}/transfer`)
            .set("Cookie", await cookieFor(ana))
            .send({ toUserId: ben.id, outgoing: "stay" });

        expect(response.status).toBe(204);
        expect(await listMembers({ projectId: project.id, userId: ana.id })).toMatchObject([
            { user_id: ana.id, role: "associate" },
            { user_id: ben.id, role: "lead" },
        ]);
    });

    it("lets the old Lead leave in the same transfer", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const ben = await createUser("ben@example.com", "Europe/Zagreb");
        const project = await createProject("Website", ana.id);
        await addMember({ projectId: project.id, userId: ben.id, role: "associate" });

        //TEST
        const response = await request(app)
            .post(`/projects/${project.id}/transfer`)
            .set("Cookie", await cookieFor(ana))
            .send({ toUserId: ben.id, outgoing: "leave" });

        expect(response.status).toBe(204);
        expect(await listMembers({ projectId: project.id, userId: ben.id })).toMatchObject([
            { user_id: ben.id, role: "lead" },
        ]);
    });

    it("answers 409 when the new Lead is not a member", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const cara = await createUser("cara@example.com", "Europe/Zagreb");
        const project = await createProject("Website", ana.id);

        //TEST
        const response = await request(app)
            .post(`/projects/${project.id}/transfer`)
            .set("Cookie", await cookieFor(ana))
            .send({ toUserId: cara.id, outgoing: "stay" });

        expect(response.status).toBe(409);
        expect(response.body).toEqual({ error: "the new Lead must be a current member of the project" });
    });

    it("answers 403 to an Associate", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const ben = await createUser("ben@example.com", "Europe/Zagreb");
        const project = await createProject("Website", ana.id);
        await addMember({ projectId: project.id, userId: ben.id, role: "associate" });

        //TEST
        const response = await request(app)
            .post(`/projects/${project.id}/transfer`)
            .set("Cookie", await cookieFor(ben))
            .send({ toUserId: ben.id, outgoing: "stay" });

        expect(response.status).toBe(403);
        expect(await listMembers({ projectId: project.id, userId: ana.id })).toMatchObject([
            { user_id: ana.id, role: "lead" },
            { user_id: ben.id, role: "associate" },
        ]);
    });

    it("refuses an outgoing Lead who neither stays nor leaves", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const ben = await createUser("ben@example.com", "Europe/Zagreb");
        const project = await createProject("Website", ana.id);
        await addMember({ projectId: project.id, userId: ben.id, role: "associate" });

        //TEST
        const response = await request(app)
            .post(`/projects/${project.id}/transfer`)
            .set("Cookie", await cookieFor(ana))
            .send({ toUserId: ben.id, outgoing: "vanish" });

        expect(response.status).toBe(400);
    });

    it("refuses a new Lead id that is not an id", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const project = await createProject("Website", ana.id);

        //TEST
        const response = await request(app)
            .post(`/projects/${project.id}/transfer`)
            .set("Cookie", await cookieFor(ana))
            .send({ toUserId: "abc", outgoing: "stay" });

        expect(response.status).toBe(400);
    });

    it("refuses a request that does not say who is asking", async () => {
        //TEST
        const response = await request(app)
            .post("/projects/1/transfer")
            .send({ toUserId: "2", outgoing: "stay" });

        expect(response.status).toBe(401);
    });
});
