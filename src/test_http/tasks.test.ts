import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../app.js";
import { createUser, createProject, addMember, createTask, listTasks } from "../queries.js";


describe("GET /projects/:projectId/tasks", () => {
    it("lists a project's tasks to a member", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const ben = await createUser("ben@example.com", "Europe/Zagreb");
        const project = await createProject("Website", ana.id);
        await addMember({ projectId: project.id, userId: ben.id, role: "associate" });
        await createTask({ projectId: project.id, title: "Fix the gate" });

        //TEST
        const response = await request(app)
            .get(`/projects/${project.id}/tasks`)
            .set("X-User-Id", ben.id);

        expect(response.status).toBe(200);
        expect(response.body.tasks).toHaveLength(1);
        expect(response.body.tasks[0].title).toBe("Fix the gate");
    });

    it("lists nothing, with 200, for a project with no tasks", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const project = await createProject("Website", ana.id);

        //TEST
        const response = await request(app)
            .get(`/projects/${project.id}/tasks`)
            .set("X-User-Id", ana.id);

        expect(response.status).toBe(200);
        expect(response.body.tasks).toHaveLength(0);
    });

    it("answers 404 to someone who is not in the project", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const cara = await createUser("cara@example.com", "Europe/Zagreb");
        const project = await createProject("Website", ana.id);
        await createTask({ projectId: project.id, title: "Fix the gate" });

        //TEST
        const response = await request(app)
            .get(`/projects/${project.id}/tasks`)
            .set("X-User-Id", cara.id);

        expect(response.status).toBe(404);
        expect(response.body).toEqual({ error: "Not found" });
    });

    it("answers 404 for a project that does not exist", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");

        //TEST
        const response = await request(app)
            .get("/projects/99/tasks")
            .set("X-User-Id", ana.id);

        expect(response.status).toBe(404);
        expect(response.body).toEqual({ error: "Not found" });
    });

    it("refuses a request that does not say who is asking", async () => {
        //TEST
        const response = await request(app).get("/projects/1/tasks");

        expect(response.status).toBe(401);
    });
});

describe("POST /projects/:projectId/tasks", () => {
    it("lets the Lead create a task", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const project = await createProject("Website", ana.id);

        //TEST
        const response = await request(app)
            .post(`/projects/${project.id}/tasks`)
            .set("X-User-Id", ana.id)
            .send({ title: "Fix the gate" });

        expect(response.status).toBe(201);
        expect(response.body.task.title).toBe("Fix the gate");

        const tasks = await listTasks({ projectId: project.id, userId: ana.id });
        expect(tasks[0]?.title).toBe("Fix the gate");
    });

    it("refuses a blank title", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const project = await createProject("Website", ana.id);

        //TEST
        const response = await request(app)
            .post(`/projects/${project.id}/tasks`)
            .set("X-User-Id", ana.id)
            .send({ title: "   " });

        expect(response.status).toBe(400);
        expect(await listTasks({ projectId: project.id, userId: ana.id })).toHaveLength(0);
    });

    it("refuses a body with a field it did not ask for", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const project = await createProject("Website", ana.id);

        //TEST
        const response = await request(app)
            .post(`/projects/${project.id}/tasks`)
            .set("X-User-Id", ana.id)
            .send({ title: "Fix the gate", projectId: project.id });

        expect(response.status).toBe(400);
        expect(await listTasks({ projectId: project.id, userId: ana.id })).toHaveLength(0);
    });

    it("answers 403 to an Associate", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const ben = await createUser("ben@example.com", "Europe/Zagreb");
        const project = await createProject("Website", ana.id);
        await addMember({ projectId: project.id, userId: ben.id, role: "associate" });

        //TEST
        const response = await request(app)
            .post(`/projects/${project.id}/tasks`)
            .set("X-User-Id", ben.id)
            .send({ title: "Fix the gate" });

        expect(response.status).toBe(403);
        expect(response.body).toEqual({ error: "Only the project's Lead can do that" });
        expect(await listTasks({ projectId: project.id, userId: ana.id })).toHaveLength(0);
    });

    it("answers 403 to an Associate before looking at the body", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const ben = await createUser("ben@example.com", "Europe/Zagreb");
        const project = await createProject("Website", ana.id);
        await addMember({ projectId: project.id, userId: ben.id, role: "associate" });

        //TEST
        const response = await request(app)
            .post(`/projects/${project.id}/tasks`)
            .set("X-User-Id", ben.id)
            .send({ title: "   " });

        expect(response.status).toBe(403);
    });

    it("answers 404 to someone who is not in the project", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const cara = await createUser("cara@example.com", "Europe/Zagreb");
        const project = await createProject("Website", ana.id);

        //TEST
        const response = await request(app)
            .post(`/projects/${project.id}/tasks`)
            .set("X-User-Id", cara.id)
            .send({ title: "Fix the gate" });

        expect(response.status).toBe(404);
        expect(response.body).toEqual({ error: "Not found" });
        expect(await listTasks({ projectId: project.id, userId: ana.id })).toHaveLength(0);
    });

    it("answers 404 for a project that does not exist", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");

        //TEST
        const response = await request(app)
            .post("/projects/99/tasks")
            .set("X-User-Id", ana.id)
            .send({ title: "Fix the gate" });

        expect(response.status).toBe(404);
        expect(response.body).toEqual({ error: "Not found" });
    });

    it("refuses a request that does not say who is asking", async () => {
        //TEST
        const response = await request(app)
            .post("/projects/1/tasks")
            .send({ title: "Fix the gate" });

        expect(response.status).toBe(401);
    });
});