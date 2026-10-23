import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../app.js";
import { createUser, createProject, addMember, createTask, createSubtask, listSubtasks, deleteTask } from "../queries.js";


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
