import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../app.js";
import { createUser, createProject, createSession, endSession } from "../queries.js";
import { cookieFor } from "../testing/session.js";


describe("who is asking", () => {
    it("lets in a request carrying a live session", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        await createProject("Website", ana.id);

        //TEST
        const response = await request(app)
            .get("/projects")
            .set("Cookie", await cookieFor(ana));

        expect(response.status).toBe(200);
        expect(response.body.projects).toHaveLength(1);
    });

    it("no longer believes an X-User-Id header", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");

        //TEST
        const response = await request(app)
            .get("/projects")
            .set("X-User-Id", ana.id);

        expect(response.status).toBe(401);
        expect(response.body).toEqual({ error: "Log in first" });
    });

    it("refuses a session that has ended", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const token = await createSession(ana.id);
        await endSession(token);

        //TEST
        const response = await request(app)
            .get("/projects")
            .set("Cookie", `taskco_session=${token}`);

        expect(response.status).toBe(401);
    });

    it("refuses a token it never handed out", async () => {
        //TEST
        const response = await request(app)
            .get("/projects")
            .set("Cookie", "taskco_session=made-up-token");

        expect(response.status).toBe(401);
    });

    it("finds its own cookie among others", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");

        //TEST
        const response = await request(app)
            .get("/projects")
            .set("Cookie", `theme=dark; ${await cookieFor(ana)}; lang=hr`);

        expect(response.status).toBe(200);
    });
});
