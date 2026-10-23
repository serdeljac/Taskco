import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../app.js";
import { pool } from "../db.js";
import { createUser, createProject, addMember, createTask, listTasks, deleteProject, deleteTask } from "../queries.js";


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

    it("gives a new task the due date it was sent", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const project = await createProject("Website", ana.id);

        //TEST
        const response = await request(app)
            .post(`/projects/${project.id}/tasks`)
            .set("X-User-Id", ana.id)
            .send({ title: "Fix the gate", dueDate: "2026-11-20" });

        expect(response.status).toBe(201);
        expect(response.body.task.due_date).toBe("2026-11-20");
    });

    it("refuses a due date that is not on the calendar", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const project = await createProject("Website", ana.id);

        //TEST
        const response = await request(app)
            .post(`/projects/${project.id}/tasks`)
            .set("X-User-Id", ana.id)
            .send({ title: "Fix the gate", dueDate: "2026-02-30" });

        expect(response.status).toBe(400);
        expect(await listTasks({ projectId: project.id, userId: ana.id })).toHaveLength(0);
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

    it("answers 409 to the Lead while the project is being deleted", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const project = await createProject("Website", ana.id);
        await deleteProject(project.id);

        //TEST
        const response = await request(app)
            .post(`/projects/${project.id}/tasks`)
            .set("X-User-Id", ana.id)
            .send({ title: "Fix the gate" });

        expect(response.status).toBe(409);
        expect(response.body).toEqual({ error: "the project is being deleted" });
    });

    it("refuses a request that does not say who is asking", async () => {
        //TEST
        const response = await request(app)
            .post("/projects/1/tasks")
            .send({ title: "Fix the gate" });

        expect(response.status).toBe(401);
    });
});

describe("PUT /tasks/:taskId/position", () => {
    it("lets the Lead move a task to the top", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const project = await createProject("Website", ana.id);
        const gate = await createTask({ projectId: project.id, title: "Fix the gate" });
        await createTask({ projectId: project.id, title: "Paint the fence" });
        const roof = await createTask({ projectId: project.id, title: "Clean the roof" });

        //TEST
        const response = await request(app)
            .put(`/tasks/${roof.id}/position`)
            .set("X-User-Id", ana.id)
            .send({ beforeTaskId: gate.id });

        expect(response.status).toBe(204);

        const tasks = await listTasks({ projectId: project.id, userId: ana.id });
        expect(tasks.map((t) => t.title)).toEqual(["Clean the roof", "Fix the gate", "Paint the fence"]);
    });

    it("lets the Lead move a task between two others", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const project = await createProject("Website", ana.id);
        const gate = await createTask({ projectId: project.id, title: "Fix the gate" });
        const fence = await createTask({ projectId: project.id, title: "Paint the fence" });
        const roof = await createTask({ projectId: project.id, title: "Clean the roof" });

        //TEST
        const response = await request(app)
            .put(`/tasks/${gate.id}/position`)
            .set("X-User-Id", ana.id)
            .send({ afterTaskId: fence.id, beforeTaskId: roof.id });

        expect(response.status).toBe(204);

        const tasks = await listTasks({ projectId: project.id, userId: ana.id });
        expect(tasks.map((t) => t.title)).toEqual(["Paint the fence", "Fix the gate", "Clean the roof"]);
    });

    it("refuses a move that names no neighbour", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const project = await createProject("Website", ana.id);
        const gate = await createTask({ projectId: project.id, title: "Fix the gate" });

        //TEST
        const response = await request(app)
            .put(`/tasks/${gate.id}/position`)
            .set("X-User-Id", ana.id)
            .send({});

        expect(response.status).toBe(400);
    });

    it("answers 409 for a neighbour in another project", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const website = await createProject("Website", ana.id);
        const shop = await createProject("Shop", ana.id);
        const gate = await createTask({ projectId: website.id, title: "Fix the gate" });
        const till = await createTask({ projectId: shop.id, title: "Count the till" });

        //TEST
        const response = await request(app)
            .put(`/tasks/${gate.id}/position`)
            .set("X-User-Id", ana.id)
            .send({ afterTaskId: till.id });

        expect(response.status).toBe(409);
        expect(response.body).toEqual({ error: "the task and its neighbours must be in the same project" });
    });

    it("answers 403 to an Associate, and moves nothing", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const ben = await createUser("ben@example.com", "Europe/Zagreb");
        const project = await createProject("Website", ana.id);
        await addMember({ projectId: project.id, userId: ben.id, role: "associate" });
        const gate = await createTask({ projectId: project.id, title: "Fix the gate" });
        const fence = await createTask({ projectId: project.id, title: "Paint the fence" });

        //TEST
        const response = await request(app)
            .put(`/tasks/${fence.id}/position`)
            .set("X-User-Id", ben.id)
            .send({ beforeTaskId: gate.id });

        expect(response.status).toBe(403);

        const tasks = await listTasks({ projectId: project.id, userId: ana.id });
        expect(tasks.map((t) => t.title)).toEqual(["Fix the gate", "Paint the fence"]);
    });

    it("refuses a request that does not say who is asking", async () => {
        //TEST
        const response = await request(app)
            .put("/tasks/1/position")
            .send({ beforeTaskId: "2" });

        expect(response.status).toBe(401);
    });
});


describe("DELETE /tasks/:taskId", () => {
    it("lets the Lead delete a task, which leaves the list but keeps its row", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const project = await createProject("Website", ana.id);
        const gate = await createTask({ projectId: project.id, title: "Fix the gate" });

        //TEST
        const response = await request(app)
            .delete(`/tasks/${gate.id}`)
            .set("X-User-Id", ana.id);

        expect(response.status).toBe(204);
        expect(await listTasks({ projectId: project.id, userId: ana.id })).toHaveLength(0);

        const row = await pool.query("select deleted_at from tasks where id = $1", [gate.id]);
        expect(row.rows[0]?.deleted_at).not.toBeNull();
    });

    it("answers 403 to an Associate, and deletes nothing", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const ben = await createUser("ben@example.com", "Europe/Zagreb");
        const project = await createProject("Website", ana.id);
        await addMember({ projectId: project.id, userId: ben.id, role: "associate" });
        const gate = await createTask({ projectId: project.id, title: "Fix the gate" });

        //TEST
        const response = await request(app)
            .delete(`/tasks/${gate.id}`)
            .set("X-User-Id", ben.id);

        expect(response.status).toBe(403);
        expect(await listTasks({ projectId: project.id, userId: ana.id })).toHaveLength(1);
    });

    it("answers 404 for a task already deleted", async () => {
        //CREATE
        const ana = await createUser("ana@example.com", "Europe/Zagreb");
        const project = await createProject("Website", ana.id);
        const gate = await createTask({ projectId: project.id, title: "Fix the gate" });
        await deleteTask(gate.id);

        //TEST
        const response = await request(app)
            .delete(`/tasks/${gate.id}`)
            .set("X-User-Id", ana.id);

        expect(response.status).toBe(404);
    });

    it("refuses a request that does not say who is asking", async () => {
        //TEST
        const response = await request(app).delete("/tasks/1");

        expect(response.status).toBe(401);
    });
});
