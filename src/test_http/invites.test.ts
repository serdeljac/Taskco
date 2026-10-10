import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../app.js";
import { createUser, createProject, createInvite } from "../queries.js";


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