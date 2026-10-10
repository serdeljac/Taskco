import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../app.js";
import { createUser, createProject, listProjectsForUser } from "../queries.js";


describe("GET /projects", () => {
    it("lists the projects the asker is in", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        await createProject("Website", ana.id);

        //TEST
        const response = await request(app)
            .get("/projects")
            .set("X-User-Id", ana.id);

        expect(response.status).toBe(200);
        expect(response.body.projects).toHaveLength(1);
        expect(response.body.projects[0].name).toBe("Website");
    });

    it("shows nobody else's projects", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const cara = await createUser("cara@example.com", "Europe/Zagreb");
        await createProject("Website", ana.id);

        //TEST
        const response = await request(app)
            .get("/projects")
            .set("X-User-Id", cara.id);

        expect(response.status).toBe(200);
        expect(response.body.projects).toHaveLength(0);
    });

    it("refuses a request that does not say who is asking", async () => {
        //TEST
        const response = await request(app).get("/projects");

        expect(response.status).toBe(401);
    });
});

describe("POST /projects", () => {
    it("creates a project in the asker's list", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");

        //TEST
        const response = await request(app)
            .post("/projects")
            .set("X-User-Id", ana.id)
            .send({ name: "Shop" });

        expect(response.status).toBe(201);
        expect(response.body.project.name).toBe("Shop");

        const projects = await listProjectsForUser(ana.id);
        expect(projects[0]?.name).toBe("Shop");
    });

    it("refuses a blank name", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");

        //TEST
        const response = await request(app)
            .post("/projects")
            .set("X-User-Id", ana.id)
            .send({ name: "   " });

        expect(response.status).toBe(400);
        expect(await listProjectsForUser(ana.id)).toHaveLength(0);
    });

    it("refuses a body with a field it did not ask for", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");

        //TEST
        const response = await request(app)
            .post("/projects")
            .set("X-User-Id", ana.id)
            .send({ name: "Shop", userId: "2" });

        expect(response.status).toBe(400);
        expect(await listProjectsForUser(ana.id)).toHaveLength(0);
    });

    it("refuses a request that does not say who is asking", async () => {
        //TEST
        const response = await request(app)
            .post("/projects")
            .send({ name: "Shop" });

        expect(response.status).toBe(401);
    });
});