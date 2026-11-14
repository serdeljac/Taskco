import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../app.js";
import { cookieFor } from "../testing/session.js";
import { pool } from "../db.js";
import { createUser, createProject, addMember, createTask, createSubtask, listSubtasks, deleteTask, setTaskDueDate, setSubtaskPriority, setSubtaskDueDate, listMembers } from "../queries.js";


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

//Yesterday for one user, as a calendar day in their own timezone. The other dates here are in 2099, so
//"not before today" never decides a test about another rule
async function yesterdayFor(user: { id: string }) {
    const { rows } = await pool.query<{ yesterday: string }>(
        `select (today - 1)::text as yesterday from user_today where user_id = $1`,
        [user.id]
    );
    return rows[0]!.yesterday;
}


describe("not before today", () => {
    it("answers 409 for a new subtask due before the asker's today", async () => {
        //CREATE
        const { ana, task } = await website();

        //TEST
        const response = await request(app)
            .post(`/tasks/${task.id}/subtasks`)
            .set("Cookie", await cookieFor(ana))
            .send({ title: "Oil the latch", dueDate: await yesterdayFor(ana) });

        expect(response.status).toBe(409);
        expect(response.body.code).toBe("subtask-due-before-today");
        expect(await reread(task, ana)).toHaveLength(1);
    });

    it("answers 409 for a subtask's date moved before the asker's today", async () => {
        //CREATE
        const { ana, task, subtask } = await website();

        //TEST
        const response = await request(app)
            .put(`/subtasks/${subtask.id}/due-date`)
            .set("Cookie", await cookieFor(ana))
            .send({ dueDate: await yesterdayFor(ana) });

        expect(response.status).toBe(409);
        expect(response.body.code).toBe("subtask-due-before-today");
        expect((await reread(task, ana))[0]?.due_date).toBeNull();
    });
});


describe("GET /tasks/:taskId/subtasks", () => {
    it("lists a task's subtasks to a member", async () => {
        //CREATE
        const { ben, task } = await website();

        //TEST
        const response = await request(app)
            .get(`/tasks/${task.id}/subtasks`)
            .set("Cookie", await cookieFor(ben));

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
            .set("Cookie", await cookieFor(cara));

        expect(response.status).toBe(404);
    });

    it("answers 404 for a deleted task", async () => {
        //CREATE
        const { ana, task } = await website();
        await deleteTask(task.id);

        //TEST
        const response = await request(app)
            .get(`/tasks/${task.id}/subtasks`)
            .set("Cookie", await cookieFor(ana));

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
            .set("Cookie", await cookieFor(ana))
            .send({ title: "Oil the latch", dueDate: "2099-11-20" });

        expect(response.status).toBe(201);
        expect(response.body.subtask).toMatchObject({ title: "Oil the latch", due_date: "2099-11-20" });
        expect((await reread(task, ana)).map((s) => s.title)).toEqual(["Buy hinges", "Oil the latch"]);
    });

    it("answers 409 for a subtask due after its task", async () => {
        //CREATE
        const { ana, task } = await website();
        await setTaskDueDate({ taskId: task.id, dueDate: "2099-11-10" });

        //TEST
        const response = await request(app)
            .post(`/tasks/${task.id}/subtasks`)
            .set("Cookie", await cookieFor(ana))
            .send({ title: "Oil the latch", dueDate: "2099-11-20" });

        expect(response.status).toBe(409);
        expect(response.body).toEqual({ error: "a subtask cannot be due after its task", code: "subtask-due-after-task" });
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
            .set("Cookie", await cookieFor(ana))
            .send({ title: "One too many" });

        expect(response.status).toBe(409);
        expect(response.body).toEqual({ error: "a task can have at most 50 subtasks", code: "subtask-limit" });
    });

    it("answers 403 to an Associate", async () => {
        //CREATE
        const { ana, ben, task } = await website();

        //TEST
        const response = await request(app)
            .post(`/tasks/${task.id}/subtasks`)
            .set("Cookie", await cookieFor(ben))
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
            .set("Cookie", await cookieFor(ana))
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
            .set("Cookie", await cookieFor(ben))
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
            .set("Cookie", await cookieFor(ana))
            .send({ status: "done" });

        expect(response.status).toBe(400);
    });

    it("answers 404 to someone who is not in the project", async () => {
        //CREATE
        const { ana, cara, task, subtask } = await website();

        //TEST
        const response = await request(app)
            .put(`/subtasks/${subtask.id}/status`)
            .set("Cookie", await cookieFor(cara))
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
            .set("Cookie", await cookieFor(ana))
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
            .set("Cookie", await cookieFor(ana))
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
            .set("Cookie", await cookieFor(ana))
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
            .set("Cookie", await cookieFor(ben))
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
            .set("Cookie", await cookieFor(ben))
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
            .set("Cookie", await cookieFor(ana))
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
            .set("Cookie", await cookieFor(cara))
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


describe("PUT /subtasks/:subtaskId/due-date", () => {
    it("lets the Lead set a subtask's due date", async () => {
        //CREATE
        const { ana, task, subtask } = await website();

        //TEST
        const response = await request(app)
            .put(`/subtasks/${subtask.id}/due-date`)
            .set("Cookie", await cookieFor(ana))
            .send({ dueDate: "2099-11-20" });

        expect(response.status).toBe(204);
        expect((await reread(task, ana))[0]?.due_date).toBe("2099-11-20");
    });

    it("answers 409 for a date after its task's", async () => {
        //CREATE
        const { ana, task, subtask } = await website();
        await setTaskDueDate({ taskId: task.id, dueDate: "2099-11-10" });

        //TEST
        const response = await request(app)
            .put(`/subtasks/${subtask.id}/due-date`)
            .set("Cookie", await cookieFor(ana))
            .send({ dueDate: "2099-11-20" });

        expect(response.status).toBe(409);
        expect(response.body).toEqual({ error: "a subtask cannot be due after its task", code: "subtask-due-after-task" });
        expect((await reread(task, ana))[0]?.due_date).toBeNull();
    });

    it("clears the date with null", async () => {
        //CREATE
        const { ana, task, subtask } = await website();
        await setSubtaskDueDate({ subtaskId: subtask.id, dueDate: "2099-11-20" });

        //TEST
        const response = await request(app)
            .put(`/subtasks/${subtask.id}/due-date`)
            .set("Cookie", await cookieFor(ana))
            .send({ dueDate: null });

        expect(response.status).toBe(204);
        expect((await reread(task, ana))[0]?.due_date).toBeNull();
    });

    it("answers 403 to an Associate", async () => {
        //CREATE
        const { ben, subtask } = await website();

        //TEST
        const response = await request(app)
            .put(`/subtasks/${subtask.id}/due-date`)
            .set("Cookie", await cookieFor(ben))
            .send({ dueDate: "2099-11-20" });

        expect(response.status).toBe(403);
    });

    it("refuses a request that does not say who is asking", async () => {
        //TEST
        const response = await request(app)
            .put("/subtasks/1/due-date")
            .send({ dueDate: "2099-11-20" });

        expect(response.status).toBe(401);
    });
});


describe("PUT /subtasks/:subtaskId/assignee", () => {
    it("lets the Lead assign a subtask to a member", async () => {
        //CREATE
        const { ana, ben, project, task, subtask } = await website();
        const members = await listMembers({ projectId: project.id, userId: ana.id });
        const bens = members.find((m) => m.user_id === ben.id);

        //TEST
        const response = await request(app)
            .put(`/subtasks/${subtask.id}/assignee`)
            .set("Cookie", await cookieFor(ana))
            .send({ membershipId: bens?.membership_id });

        expect(response.status).toBe(204);
        expect((await reread(task, ana))[0]?.assignee_membership_id).toBe(bens?.membership_id);
    });

    it("answers 409 for a membership in another project, which only code can refuse", async () => {
        //CREATE
        const { ana, cara, task, subtask } = await website();
        const shop = await createProject("Shop", cara.id);
        const [caras] = await listMembers({ projectId: shop.id, userId: cara.id });

        //TEST
        const response = await request(app)
            .put(`/subtasks/${subtask.id}/assignee`)
            .set("Cookie", await cookieFor(ana))
            .send({ membershipId: caras?.membership_id });

        expect(response.status).toBe(409);
        expect(response.body).toEqual({ error: "the assignee must be a current member of the project", code: "assignee-not-a-member" });
        expect((await reread(task, ana))[0]?.assignee_membership_id).not.toBe(caras?.membership_id);
    });

    it("answers 403 to an Associate", async () => {
        //CREATE
        const { ben, subtask } = await website();

        //TEST
        const response = await request(app)
            .put(`/subtasks/${subtask.id}/assignee`)
            .set("Cookie", await cookieFor(ben))
            .send({ membershipId: null });

        expect(response.status).toBe(403);
    });

    it("refuses a request that does not say who is asking", async () => {
        //TEST
        const response = await request(app)
            .put("/subtasks/1/assignee")
            .send({ membershipId: null });

        expect(response.status).toBe(401);
    });
});


describe("DELETE /subtasks/:subtaskId", () => {
    it("lets the Lead delete a subtask, which leaves the list but keeps its row", async () => {
        //CREATE
        const { ana, task, subtask } = await website();

        //TEST
        const response = await request(app)
            .delete(`/subtasks/${subtask.id}`)
            .set("Cookie", await cookieFor(ana));

        expect(response.status).toBe(204);
        expect(await reread(task, ana)).toHaveLength(0);

        const row = await pool.query("select deleted_at from subtasks where id = $1", [subtask.id]);
        expect(row.rows[0]?.deleted_at).not.toBeNull();
    });

    it("answers 403 to an Associate, and deletes nothing", async () => {
        //CREATE
        const { ana, ben, task, subtask } = await website();

        //TEST
        const response = await request(app)
            .delete(`/subtasks/${subtask.id}`)
            .set("Cookie", await cookieFor(ben));

        expect(response.status).toBe(403);
        expect(await reread(task, ana)).toHaveLength(1);
    });

    it("refuses a request that does not say who is asking", async () => {
        //TEST
        const response = await request(app).delete("/subtasks/1");

        expect(response.status).toBe(401);
    });
});


describe("PUT /subtasks/:subtaskId/title", () => {
    it("lets the Lead rename a subtask, trimming the title", async () => {
        //CREATE
        const { ana, task, subtask } = await website();

        //TEST
        const response = await request(app)
            .put(`/subtasks/${subtask.id}/title`)
            .set("Cookie", await cookieFor(ana))
            .send({ title: "  Buy brass hinges  " });

        expect(response.status).toBe(204);
        expect((await reread(task, ana))[0]?.title).toBe("Buy brass hinges");
    });

    it("answers 403 to an Associate", async () => {
        //CREATE
        const { ana, ben, task, subtask } = await website();

        //TEST
        const response = await request(app)
            .put(`/subtasks/${subtask.id}/title`)
            .set("Cookie", await cookieFor(ben))
            .send({ title: "Buy brass hinges" });

        expect(response.status).toBe(403);
        expect((await reread(task, ana))[0]?.title).toBe("Buy hinges");
    });

    it("refuses a blank title", async () => {
        //CREATE
        const { ana, task, subtask } = await website();

        //TEST
        const response = await request(app)
            .put(`/subtasks/${subtask.id}/title`)
            .set("Cookie", await cookieFor(ana))
            .send({ title: "   " });

        expect(response.status).toBe(400);
        expect(response.body.code).toBe("invalid-body");
        expect((await reread(task, ana))[0]?.title).toBe("Buy hinges");
    });

    it("refuses a request that does not say who is asking", async () => {
        //TEST
        const response = await request(app)
            .put("/subtasks/1/title")
            .send({ title: "Buy brass hinges" });

        expect(response.status).toBe(401);
    });
});


describe("PUT /subtasks/:subtaskId/position", () => {
    //Website's task with three subtasks: Buy hinges, Oil the latch and Paint the gate
    async function threeSubtasks() {
        const picture = await website();
        const latch = await createSubtask({ taskId: picture.task.id, title: "Oil the latch" });
        const paint = await createSubtask({ taskId: picture.task.id, title: "Paint the gate" });
        const titles = async () => (await reread(picture.task, picture.ana)).map((subtask) => subtask.title);
        return { ...picture, hinges: picture.subtask, latch, paint, titles };
    }

    it("lets the Lead move a subtask to the top", async () => {
        //CREATE
        const { ana, hinges, paint, titles } = await threeSubtasks();

        //TEST
        const response = await request(app)
            .put(`/subtasks/${paint.id}/position`)
            .set("Cookie", await cookieFor(ana))
            .send({ beforeSubtaskId: hinges.id });

        expect(response.status).toBe(204);
        expect(await titles()).toEqual(["Paint the gate", "Buy hinges", "Oil the latch"]);
    });

    it("lets the Lead move a subtask between two others", async () => {
        //CREATE
        const { ana, hinges, latch, paint, titles } = await threeSubtasks();

        //TEST
        const response = await request(app)
            .put(`/subtasks/${hinges.id}/position`)
            .set("Cookie", await cookieFor(ana))
            .send({ afterSubtaskId: latch.id, beforeSubtaskId: paint.id });

        expect(response.status).toBe(204);
        expect(await titles()).toEqual(["Oil the latch", "Buy hinges", "Paint the gate"]);
    });

    it("refuses a move that names no neighbour", async () => {
        //CREATE
        const { ana, latch } = await threeSubtasks();

        //TEST
        const response = await request(app)
            .put(`/subtasks/${latch.id}/position`)
            .set("Cookie", await cookieFor(ana))
            .send({});

        expect(response.status).toBe(400);
        expect(response.body.code).toBe("invalid-body");
    });

    it("answers 409 for a neighbour under another task", async () => {
        //CREATE
        const { ana, project, hinges } = await threeSubtasks();
        const roof = await createTask({ projectId: project.id, title: "Clean the roof" });
        const ladder = await createSubtask({ taskId: roof.id, title: "Fetch the ladder" });

        //TEST
        const response = await request(app)
            .put(`/subtasks/${hinges.id}/position`)
            .set("Cookie", await cookieFor(ana))
            .send({ afterSubtaskId: ladder.id });

        expect(response.status).toBe(409);
        expect(response.body).toEqual({
            error: "the subtask and its neighbours must be under the same task",
            code: "neighbour-in-another-task",
        });
    });

    it("answers 409 for a subtask named as its own neighbour, and moves nothing", async () => {
        //CREATE
        const { ana, latch, titles } = await threeSubtasks();

        //TEST
        const response = await request(app)
            .put(`/subtasks/${latch.id}/position`)
            .set("Cookie", await cookieFor(ana))
            .send({ afterSubtaskId: latch.id });

        expect(response.status).toBe(409);
        expect(response.body).toEqual({ error: "a subtask cannot be its own neighbour", code: "own-neighbour" });
        expect(await titles()).toEqual(["Buy hinges", "Oil the latch", "Paint the gate"]);
    });

    it("answers 403 to an Associate, and moves nothing", async () => {
        //CREATE
        const { ben, hinges, paint, titles } = await threeSubtasks();

        //TEST
        const response = await request(app)
            .put(`/subtasks/${paint.id}/position`)
            .set("Cookie", await cookieFor(ben))
            .send({ beforeSubtaskId: hinges.id });

        expect(response.status).toBe(403);
        expect(await titles()).toEqual(["Buy hinges", "Oil the latch", "Paint the gate"]);
    });

    it("refuses a request that does not say who is asking", async () => {
        //TEST
        const response = await request(app)
            .put("/subtasks/1/position")
            .send({ beforeSubtaskId: "2" });

        expect(response.status).toBe(401);
    });
});
