import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../app.js";
import { createUser, createProject, addMember, createTask, listTasks, deleteTask, setTaskPriority } from "../queries.js";


//The picture every test here starts from: Ana leads Website, Ben is an Associate in it, Cara is not in it,
//and Website has one task
async function website() {
    const ana = await createUser("ana@example.com", "Europe/Zagreb");
    const ben = await createUser("ben@example.com", "Europe/Zagreb");
    const cara = await createUser("cara@example.com", "Europe/Zagreb");
    const project = await createProject("Website", ana.id);
    await addMember({ projectId: project.id, userId: ben.id, role: "associate" });
    const task = await createTask({ projectId: project.id, title: "Fix the gate" });
    return { ana, ben, cara, project, task };
}

//The task as its Lead sees it now
async function reread(project: { id: string }, ana: { id: string }) {
    const tasks = await listTasks({ projectId: project.id, userId: ana.id });
    return tasks[0];
}


describe("PUT /tasks/:taskId/status", () => {
    it("lets an Associate change a task's status", async () => {
        //CREATE
        const { ana, ben, project, task } = await website();

        //TEST
        const response = await request(app)
            .put(`/tasks/${task.id}/status`)
            .set("X-User-Id", ben.id)
            .send({ status: "in_progress" });

        expect(response.status).toBe(204);
        expect((await reread(project, ana))?.status).toBe("in_progress");
    });

    it("refuses a status that is not on the list", async () => {
        //CREATE
        const { ana, project, task } = await website();

        //TEST
        const response = await request(app)
            .put(`/tasks/${task.id}/status`)
            .set("X-User-Id", ana.id)
            .send({ status: "done" });

        expect(response.status).toBe(400);
        expect((await reread(project, ana))?.status).toBe("not_started");
    });

    it("answers 404 to someone who is not in the project", async () => {
        //CREATE
        const { ana, cara, project, task } = await website();

        //TEST
        const response = await request(app)
            .put(`/tasks/${task.id}/status`)
            .set("X-User-Id", cara.id)
            .send({ status: "completed" });

        expect(response.status).toBe(404);
        expect((await reread(project, ana))?.status).toBe("not_started");
    });

    it("answers 404 for a deleted task", async () => {
        //CREATE
        const { ana, task } = await website();
        await deleteTask(task.id);

        //TEST
        const response = await request(app)
            .put(`/tasks/${task.id}/status`)
            .set("X-User-Id", ana.id)
            .send({ status: "completed" });

        expect(response.status).toBe(404);
    });

    it("answers 404 for a task id that is not a number", async () => {
        //CREATE
        const { ana } = await website();

        //TEST
        const response = await request(app)
            .put("/tasks/abc/status")
            .set("X-User-Id", ana.id)
            .send({ status: "completed" });

        expect(response.status).toBe(404);
    });

    it("refuses a request that does not say who is asking", async () => {
        //TEST
        const response = await request(app)
            .put("/tasks/1/status")
            .send({ status: "completed" });

        expect(response.status).toBe(401);
    });
});


describe("PUT /tasks/:taskId/priority", () => {
    it("lets the Lead set a task's priority", async () => {
        //CREATE
        const { ana, project, task } = await website();

        //TEST
        const response = await request(app)
            .put(`/tasks/${task.id}/priority`)
            .set("X-User-Id", ana.id)
            .send({ priority: "high" });

        expect(response.status).toBe(204);
        expect((await reread(project, ana))?.priority).toBe("high");
    });

    it("lets the Lead clear the priority with null", async () => {
        //CREATE
        const { ana, project, task } = await website();
        await setTaskPriority({ taskId: task.id, priority: "high" });

        //TEST
        const response = await request(app)
            .put(`/tasks/${task.id}/priority`)
            .set("X-User-Id", ana.id)
            .send({ priority: null });

        expect(response.status).toBe(204);
        expect((await reread(project, ana))?.priority).toBeNull();
    });

    it("answers 403 to an Associate", async () => {
        //CREATE
        const { ana, ben, project, task } = await website();

        //TEST
        const response = await request(app)
            .put(`/tasks/${task.id}/priority`)
            .set("X-User-Id", ben.id)
            .send({ priority: "high" });

        expect(response.status).toBe(403);
        expect((await reread(project, ana))?.priority).toBeNull();
    });

    it("refuses a priority that is not on the list", async () => {
        //CREATE
        const { ana, task } = await website();

        //TEST
        const response = await request(app)
            .put(`/tasks/${task.id}/priority`)
            .set("X-User-Id", ana.id)
            .send({ priority: "urgent" });

        expect(response.status).toBe(400);
    });

    it("refuses a request that does not say who is asking", async () => {
        //TEST
        const response = await request(app)
            .put("/tasks/1/priority")
            .send({ priority: "high" });

        expect(response.status).toBe(401);
    });
});
