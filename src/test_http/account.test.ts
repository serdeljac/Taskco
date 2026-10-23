import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../app.js";
import { pool } from "../db.js";
import { createUser, createProject, addMember, listProjectsForUser, deleteAccount } from "../queries.js";


describe("POST /account/deletion", () => {
    it("starts the account's thirty days, and puts the projects it leads into delete mode", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const ben = await createUser("ben@example.com", "Europe/Zagreb");
        const project = await createProject("Website", ana.id);
        await addMember({ projectId: project.id, userId: ben.id, role: "associate" });

        //TEST
        const response = await request(app)
            .post("/account/deletion")
            .set("X-User-Id", ana.id);

        expect(response.status).toBe(201);

        const row = await pool.query<{ deletion_scheduled_at: Date }>(
            "select deletion_scheduled_at from users where id = $1",
            [ana.id]
        );
        expect(response.body.scheduledFor).toBe(row.rows[0]?.deletion_scheduled_at.toISOString());
        expect(await listProjectsForUser(ben.id)).toHaveLength(0);
    });

    it("answers 409 when the account is already being deleted", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        await deleteAccount(ana.id);

        //TEST
        const response = await request(app)
            .post("/account/deletion")
            .set("X-User-Id", ana.id);

        expect(response.status).toBe(409);
    });

    it("refuses a request that does not say who is asking", async () => {
        //TEST
        const response = await request(app).post("/account/deletion");

        expect(response.status).toBe(401);
    });
});
