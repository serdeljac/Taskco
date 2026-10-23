import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../app.js";
import { cookieFor } from "../testing/session.js";
import { createUser, createProject, addMember, createTask, listTasks, deleteTask, setTaskPriority, setTaskNotes, createSubtask, listSubtasks, setTaskDueDate, listMembers } from "../queries.js";


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
            .set("Cookie", await cookieFor(ben))
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
            .set("Cookie", await cookieFor(ana))
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
            .set("Cookie", await cookieFor(cara))
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
            .set("Cookie", await cookieFor(ana))
            .send({ status: "completed" });

        expect(response.status).toBe(404);
    });

    it("answers 404 for a task id that is not a number", async () => {
        //CREATE
        const { ana } = await website();

        //TEST
        const response = await request(app)
            .put("/tasks/abc/status")
            .set("Cookie", await cookieFor(ana))
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
            .set("Cookie", await cookieFor(ana))
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
            .set("Cookie", await cookieFor(ana))
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
            .set("Cookie", await cookieFor(ben))
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
            .set("Cookie", await cookieFor(ana))
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
            .set("Cookie", await cookieFor(ben))
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
            .set("Cookie", await cookieFor(ana))
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
            .set("Cookie", await cookieFor(ana))
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
            .set("Cookie", await cookieFor(ana))
            .send({ notes: 5 });

        expect(response.status).toBe(400);
    });

    it("answers 404 to someone who is not in the project", async () => {
        //CREATE
        const { ana, cara, project, task } = await website();

        //TEST
        const response = await request(app)
            .put(`/tasks/${task.id}/notes`)
            .set("Cookie", await cookieFor(cara))
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
            .set("Cookie", await cookieFor(ana))
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
            .set("Cookie", await cookieFor(ana))
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
            .set("Cookie", await cookieFor(ana))
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
            .set("Cookie", await cookieFor(ben))
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
            .set("Cookie", await cookieFor(ana))
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


describe("PUT /tasks/:taskId/assignee", () => {
    it("lets the Lead assign a task to a member", async () => {
        //CREATE
        const { ana, ben, project, task } = await website();
        const members = await listMembers({ projectId: project.id, userId: ana.id });
        const bens = members.find((m) => m.user_id === ben.id);

        //TEST
        const response = await request(app)
            .put(`/tasks/${task.id}/assignee`)
            .set("Cookie", await cookieFor(ana))
            .send({ membershipId: bens?.membership_id });

        expect(response.status).toBe(204);
        expect((await reread(project, ana))?.assignee_membership_id).toBe(bens?.membership_id);
    });

    it("leaves a task with nobody assigned when sent null", async () => {
        //CREATE
        const { ana, project, task } = await website();

        //TEST
        const response = await request(app)
            .put(`/tasks/${task.id}/assignee`)
            .set("Cookie", await cookieFor(ana))
            .send({ membershipId: null });

        expect(response.status).toBe(204);
        expect((await reread(project, ana))?.assignee_membership_id).toBeNull();
    });

    it("answers 409 for a membership in another project", async () => {
        //CREATE
        const { ana, cara, project, task } = await website();
        const shop = await createProject("Shop", cara.id);
        const [caras] = await listMembers({ projectId: shop.id, userId: cara.id });

        //TEST
        const response = await request(app)
            .put(`/tasks/${task.id}/assignee`)
            .set("Cookie", await cookieFor(ana))
            .send({ membershipId: caras?.membership_id });

        expect(response.status).toBe(409);
        expect(response.body).toEqual({ error: "the assignee must be a current member of the project" });
        expect((await reread(project, ana))?.assignee_membership_id).not.toBe(caras?.membership_id);
    });

    it("answers 403 to an Associate", async () => {
        //CREATE
        const { ben, task } = await website();

        //TEST
        const response = await request(app)
            .put(`/tasks/${task.id}/assignee`)
            .set("Cookie", await cookieFor(ben))
            .send({ membershipId: null });

        expect(response.status).toBe(403);
    });

    it("refuses a membership id that is not an id", async () => {
        //CREATE
        const { ana, task } = await website();

        //TEST
        const response = await request(app)
            .put(`/tasks/${task.id}/assignee`)
            .set("Cookie", await cookieFor(ana))
            .send({ membershipId: "abc" });

        expect(response.status).toBe(400);
    });

    it("refuses a request that does not say who is asking", async () => {
        //TEST
        const response = await request(app)
            .put("/tasks/1/assignee")
            .send({ membershipId: null });

        expect(response.status).toBe(401);
    });
});
