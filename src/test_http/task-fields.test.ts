import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../app.js";
import { createUser, createProject, addMember, createTask, listTasks, deleteTask, setTaskPriority, setTaskNotes, createSubtask, listSubtasks, setTaskDueDate } from "../queries.js";


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


describe("PUT /tasks/:taskId/notes", () => {
    it("lets an Associate write a task's notes", async () => {
        //CREATE
        const { ana, ben, project, task } = await website();

        //TEST
        const response = await request(app)
            .put(`/tasks/${task.id}/notes`)
            .set("X-User-Id", ben.id)
            .send({ notes: "Buy new hinges first" });

        expect(response.status).toBe(204);
        expect((await reread(project, ana))?.notes).toBe("Buy new hinges first");
    });

    it("stores blank notes as empty", async () => {
        //CREATE
        const { ana, project, task } = await website();
        await setTaskNotes({ taskId: task.id, notes: "Buy new hinges first" });

        //TEST
        const response = await request(app)
            .put(`/tasks/${task.id}/notes`)
            .set("X-User-Id", ana.id)
            .send({ notes: "   " });

        expect(response.status).toBe(204);
        expect((await reread(project, ana))?.notes).toBeNull();
    });

    it("clears the notes with null", async () => {
        //CREATE
        const { ana, project, task } = await website();
        await setTaskNotes({ taskId: task.id, notes: "Buy new hinges first" });

        //TEST
        const response = await request(app)
            .put(`/tasks/${task.id}/notes`)
            .set("X-User-Id", ana.id)
            .send({ notes: null });

        expect(response.status).toBe(204);
        expect((await reread(project, ana))?.notes).toBeNull();
    });

    it("refuses notes that are not text", async () => {
        //CREATE
        const { ana, task } = await website();

        //TEST
        const response = await request(app)
            .put(`/tasks/${task.id}/notes`)
            .set("X-User-Id", ana.id)
            .send({ notes: 5 });

        expect(response.status).toBe(400);
    });

    it("answers 404 to someone who is not in the project", async () => {
        //CREATE
        const { ana, cara, project, task } = await website();

        //TEST
        const response = await request(app)
            .put(`/tasks/${task.id}/notes`)
            .set("X-User-Id", cara.id)
            .send({ notes: "Mine now" });

        expect(response.status).toBe(404);
        expect((await reread(project, ana))?.notes).toBeNull();
    });

    it("refuses a request that does not say who is asking", async () => {
        //TEST
        const response = await request(app)
            .put("/tasks/1/notes")
            .send({ notes: "Buy new hinges first" });

        expect(response.status).toBe(401);
    });
});


describe("PUT /tasks/:taskId/due-date", () => {
    it("lets the Lead change a task's due date", async () => {
        //CREATE
        const { ana, project, task } = await website();

        //TEST
        const response = await request(app)
            .put(`/tasks/${task.id}/due-date`)
            .set("X-User-Id", ana.id)
            .send({ dueDate: "2026-11-20" });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ clearedSubtasks: 0 });
        expect((await reread(project, ana))?.due_date).toBe("2026-11-20");
    });

    it("says how many subtask dates it cleared", async () => {
        //CREATE
        const { ana, task } = await website();
        await createSubtask({ taskId: task.id, title: "Buy hinges", dueDate: "2026-11-20" });

        //TEST
        const response = await request(app)
            .put(`/tasks/${task.id}/due-date`)
            .set("X-User-Id", ana.id)
            .send({ dueDate: "2026-11-10" });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ clearedSubtasks: 1 });

        const subtasks = await listSubtasks({ taskId: task.id, userId: ana.id });
        expect(subtasks[0]?.due_date).toBeNull();
    });

    it("clears the due date with null", async () => {
        //CREATE
        const { ana, project, task } = await website();
        await setTaskDueDate({ taskId: task.id, dueDate: "2026-11-20" });

        //TEST
        const response = await request(app)
            .put(`/tasks/${task.id}/due-date`)
            .set("X-User-Id", ana.id)
            .send({ dueDate: null });

        expect(response.status).toBe(200);
        expect((await reread(project, ana))?.due_date).toBeNull();
    });

    it("answers 403 to an Associate", async () => {
        //CREATE
        const { ana, ben, project, task } = await website();

        //TEST
        const response = await request(app)
            .put(`/tasks/${task.id}/due-date`)
            .set("X-User-Id", ben.id)
            .send({ dueDate: "2026-11-20" });

        expect(response.status).toBe(403);
        expect((await reread(project, ana))?.due_date).toBeNull();
    });

    it("refuses a day that is not on the calendar", async () => {
        //CREATE
        const { ana, task } = await website();

        //TEST
        const response = await request(app)
            .put(`/tasks/${task.id}/due-date`)
            .set("X-User-Id", ana.id)
            .send({ dueDate: "2026-02-30" });

        expect(response.status).toBe(400);
    });

    it("refuses a request that does not say who is asking", async () => {
        //TEST
        const response = await request(app)
            .put("/tasks/1/due-date")
            .send({ dueDate: "2026-11-20" });

        expect(response.status).toBe(401);
    });
});
