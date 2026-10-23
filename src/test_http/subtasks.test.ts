import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../app.js";
import { createUser, createProject, addMember, createTask, createSubtask, listSubtasks, deleteTask, setTaskDueDate, setSubtaskPriority } from "../queries.js";


//The picture every test here starts from: Ana leads Website, Ben is an Associate in it, Cara is not in it,
//and Website has one task with one subtask
async function website() {
    const ana = await createUser("ana@example.com", "Europe/Zagreb");
    const ben = await createUser("ben@example.com", "Europe/Zagreb");
    const cara = await createUser("cara@example.com", "Europe/Zagreb");
    const project = await createProject("Website", ana.id);
    await addMember({ projectId: project.id, userId: ben.id, role: "associate" });
    const task = await createTask({ projectId: project.id, title: "Fix the gate" });
    const subtask = await createSubtask({ taskId: task.id, title: "Buy hinges" });
    return { ana, ben, cara, project, task, subtask };
}

//The task's subtasks as its Lead sees them now
async function reread(task: { id: string }, ana: { id: string }) {
    return listSubtasks({ taskId: task.id, userId: ana.id });
}


describe("GET /tasks/:taskId/subtasks", () => {
    it("lists a task's subtasks to a member", async () => {
        //CREATE
        const { ben, task } = await website();

        //TEST
        const response = await request(app)
            .get(`/tasks/${task.id}/subtasks`)
            .set("X-User-Id", ben.id);

        expect(response.status).toBe(200);
        expect(response.body.subtasks).toHaveLength(1);
        expect(response.body.subtasks[0].title).toBe("Buy hinges");
    });

    it("answers 404 to someone who is not in the project", async () => {
        //CREATE
        const { cara, task } = await website();

        //TEST
        const response = await request(app)
            .get(`/tasks/${task.id}/subtasks`)
            .set("X-User-Id", cara.id);

        expect(response.status).toBe(404);
    });

    it("answers 404 for a deleted task", async () => {
        //CREATE
        const { ana, task } = await website();
        await deleteTask(task.id);

        //TEST
        const response = await request(app)
            .get(`/tasks/${task.id}/subtasks`)
            .set("X-User-Id", ana.id);

        expect(response.status).toBe(404);
    });

    it("refuses a request that does not say who is asking", async () => {
        //TEST
        const response = await request(app).get("/tasks/1/subtasks");

        expect(response.status).toBe(401);
    });
});


describe("POST /tasks/:taskId/subtasks", () => {
    it("lets the Lead add a subtask", async () => {
        //CREATE
        const { ana, task } = await website();

        //TEST
        const response = await request(app)
            .post(`/tasks/${task.id}/subtasks`)
            .set("X-User-Id", ana.id)
            .send({ title: "Oil the latch", dueDate: "2026-11-20" });

        expect(response.status).toBe(201);
        expect(response.body.subtask).toMatchObject({ title: "Oil the latch", due_date: "2026-11-20" });
        expect((await reread(task, ana)).map((s) => s.title)).toEqual(["Buy hinges", "Oil the latch"]);
    });

    it("answers 409 for a subtask due after its task", async () => {
        //CREATE
        const { ana, task } = await website();
        await setTaskDueDate({ taskId: task.id, dueDate: "2026-11-10" });

        //TEST
        const response = await request(app)
            .post(`/tasks/${task.id}/subtasks`)
            .set("X-User-Id", ana.id)
            .send({ title: "Oil the latch", dueDate: "2026-11-20" });

        expect(response.status).toBe(409);
        expect(response.body).toEqual({ error: "a subtask cannot be due after its task" });
        expect(await reread(task, ana)).toHaveLength(1);
    });

    it("answers 409 once a task has fifty subtasks", async () => {
        //CREATE
        const { ana, task } = await website();
        for (let n = 2; n <= 50; n++) {
            await createSubtask({ taskId: task.id, title: `Step ${n}` });
        }

        //TEST
        const response = await request(app)
            .post(`/tasks/${task.id}/subtasks`)
            .set("X-User-Id", ana.id)
            .send({ title: "One too many" });

        expect(response.status).toBe(409);
        expect(response.body).toEqual({ error: "a task can have at most 50 subtasks" });
    });

    it("answers 403 to an Associate", async () => {
        //CREATE
        const { ana, ben, task } = await website();

        //TEST
        const response = await request(app)
            .post(`/tasks/${task.id}/subtasks`)
            .set("X-User-Id", ben.id)
            .send({ title: "Oil the latch" });

        expect(response.status).toBe(403);
        expect(await reread(task, ana)).toHaveLength(1);
    });

    it("refuses a blank title", async () => {
        //CREATE
        const { ana, task } = await website();

        //TEST
        const response = await request(app)
            .post(`/tasks/${task.id}/subtasks`)
            .set("X-User-Id", ana.id)
            .send({ title: "   " });

        expect(response.status).toBe(400);
        expect(await reread(task, ana)).toHaveLength(1);
    });

    it("refuses a request that does not say who is asking", async () => {
        //TEST
        const response = await request(app)
            .post("/tasks/1/subtasks")
            .send({ title: "Oil the latch" });

        expect(response.status).toBe(401);
    });
});


describe("PUT /subtasks/:subtaskId/status", () => {
    it("lets an Associate change a subtask's status", async () => {
        //CREATE
        const { ana, ben, task, subtask } = await website();

        //TEST
        const response = await request(app)
            .put(`/subtasks/${subtask.id}/status`)
            .set("X-User-Id", ben.id)
            .send({ status: "completed" });

        expect(response.status).toBe(204);
        expect((await reread(task, ana))[0]?.status).toBe("completed");
    });

    it("refuses a status that is not on the list", async () => {
        //CREATE
        const { ana, subtask } = await website();

        //TEST
        const response = await request(app)
            .put(`/subtasks/${subtask.id}/status`)
            .set("X-User-Id", ana.id)
            .send({ status: "done" });

        expect(response.status).toBe(400);
    });

    it("answers 404 to someone who is not in the project", async () => {
        //CREATE
        const { ana, cara, task, subtask } = await website();

        //TEST
        const response = await request(app)
            .put(`/subtasks/${subtask.id}/status`)
            .set("X-User-Id", cara.id)
            .send({ status: "completed" });

        expect(response.status).toBe(404);
        expect((await reread(task, ana))[0]?.status).toBe("not_started");
    });

    it("answers 404 for a subtask whose task was deleted", async () => {
        //CREATE
        const { ana, task, subtask } = await website();
        await deleteTask(task.id);

        //TEST
        const response = await request(app)
            .put(`/subtasks/${subtask.id}/status`)
            .set("X-User-Id", ana.id)
            .send({ status: "completed" });

        expect(response.status).toBe(404);
    });

    it("refuses a request that does not say who is asking", async () => {
        //TEST
        const response = await request(app)
            .put("/subtasks/1/status")
            .send({ status: "completed" });

        expect(response.status).toBe(401);
    });
});


describe("PUT /subtasks/:subtaskId/priority", () => {
    it("lets the Lead set a subtask's priority", async () => {
        //CREATE
        const { ana, task, subtask } = await website();

        //TEST
        const response = await request(app)
            .put(`/subtasks/${subtask.id}/priority`)
            .set("X-User-Id", ana.id)
            .send({ priority: "low" });

        expect(response.status).toBe(204);
        expect((await reread(task, ana))[0]?.priority).toBe("low");
    });

    it("lets the Lead clear the priority with null", async () => {
        //CREATE
        const { ana, task, subtask } = await website();
        await setSubtaskPriority({ subtaskId: subtask.id, priority: "low" });

        //TEST
        const response = await request(app)
            .put(`/subtasks/${subtask.id}/priority`)
            .set("X-User-Id", ana.id)
            .send({ priority: null });

        expect(response.status).toBe(204);
        expect((await reread(task, ana))[0]?.priority).toBeNull();
    });

    it("answers 403 to an Associate", async () => {
        //CREATE
        const { ana, ben, task, subtask } = await website();

        //TEST
        const response = await request(app)
            .put(`/subtasks/${subtask.id}/priority`)
            .set("X-User-Id", ben.id)
            .send({ priority: "high" });

        expect(response.status).toBe(403);
        expect((await reread(task, ana))[0]?.priority).toBeNull();
    });

    it("refuses a request that does not say who is asking", async () => {
        //TEST
        const response = await request(app)
            .put("/subtasks/1/priority")
            .send({ priority: "high" });

        expect(response.status).toBe(401);
    });
});


describe("PUT /subtasks/:subtaskId/notes", () => {
    it("lets an Associate write a subtask's notes", async () => {
        //CREATE
        const { ana, ben, task, subtask } = await website();

        //TEST
        const response = await request(app)
            .put(`/subtasks/${subtask.id}/notes`)
            .set("X-User-Id", ben.id)
            .send({ notes: "Brass, not steel" });

        expect(response.status).toBe(204);
        expect((await reread(task, ana))[0]?.notes).toBe("Brass, not steel");
    });

    it("stores blank notes as empty", async () => {
        //CREATE
        const { ana, task, subtask } = await website();

        //TEST
        const response = await request(app)
            .put(`/subtasks/${subtask.id}/notes`)
            .set("X-User-Id", ana.id)
            .send({ notes: "   " });

        expect(response.status).toBe(204);
        expect((await reread(task, ana))[0]?.notes).toBeNull();
    });

    it("answers 404 to someone who is not in the project", async () => {
        //CREATE
        const { ana, cara, task, subtask } = await website();

        //TEST
        const response = await request(app)
            .put(`/subtasks/${subtask.id}/notes`)
            .set("X-User-Id", cara.id)
            .send({ notes: "Mine now" });

        expect(response.status).toBe(404);
        expect((await reread(task, ana))[0]?.notes).toBeNull();
    });

    it("refuses a request that does not say who is asking", async () => {
        //TEST
        const response = await request(app)
            .put("/subtasks/1/notes")
            .send({ notes: "Brass, not steel" });

        expect(response.status).toBe(401);
    });
});
