import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../app.js";
import { createUser, createProject, addMember } from "../queries.js";


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
            .set("X-User-Id", ben.id);

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
            .set("X-User-Id", cara.id);

        expect(response.status).toBe(404);
        expect(response.body).toEqual({ error: "Not found" });
    });

    it("refuses a request that does not say who is asking", async () => {
        //TEST
        const response = await request(app).get("/projects/1/members");

        expect(response.status).toBe(401);
    });
});
