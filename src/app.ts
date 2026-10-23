import express, { type ErrorRequestHandler } from "express";
import { z } from "zod";
import { listProjectsForUser, listRoutines, listInvitesForUser, createProject, createRoutine, listTasks, createTask } from "./queries.js";

//Tells TypeScript that res.locals.userId is a string. Without this it’s any, which TypeScript never checks
declare global {
    namespace Express {
        interface Locals {
            userId: string;
        }
    }
}

//	Creates the app
export const app = express();

//Stops Express adding an X-Powered-By: Express header to every response
app.disable("x-powered-by");
app.use(express.json());

//Who is asking. This runs before every route. No header, or a header that isn’t an id → 401. Otherwise it stores the id and next() moves on to the route
app.use((req, res, next) => {
    const userId = req.get("X-User-Id");

    if (!userId || !/^[1-9][0-9]{0,17}$/.test(userId)) {
        res.status(401).json({ error: "Say who is asking" });
        return;
    }

    res.locals.userId = userId;
    next();
});

//The endpoint. GET /projects runs your function with the stored id and sends the list back, wrapped as { projects: [...] }
app.get("/projects", async (req, res) => {
    const projects = await listProjectsForUser(res.locals.userId);
    res.json({ projects });
});

app.get("/routines", async (req, res) => {
    const routines = await listRoutines(res.locals.userId);
    res.json({ routines });
});

app.get("/invites", async (req, res) => {
    const invites = await listInvitesForUser(res.locals.userId);
    res.json({ invites });
});

const newProject = z.strictObject({
    name: z.string().trim().min(1),
});

app.post("/projects", async (req, res) => {
    const body = newProject.safeParse(req.body);

    if (!body.success) {
        res.status(400).json({ error: "The request body is not valid", issues: body.error.issues });
        return;
    }

    const project = await createProject(body.data.name, res.locals.userId);
    res.status(201).json({ project });
});

const newRoutine = z.strictObject({
    name: z.string().trim().min(1),
    weekdays: z.array(z.number().int().min(1).max(7)).min(1),
});

app.post("/routines", async (req, res) => {
    const body = newRoutine.safeParse(req.body);

    if (!body.success) {
        res.status(400).json({ error: "The request body is not valid", issues: body.error.issues });
        return;
    }

    const routine = await createRoutine({
        userId: res.locals.userId,
        name: body.data.name,
        weekdays: body.data.weekdays,
    });
    res.status(201).json({ routine });
});

app.get("/projects/:projectId/tasks", async (req, res) => {
    const projectId = req.params.projectId;

    const projects = await listProjectsForUser(res.locals.userId);
    if (!projects.some((project) => project.id === projectId)) {
        res.status(404).json({ error: "Not found" });
        return;
    }

    const tasks = await listTasks({ projectId, userId: res.locals.userId });
    res.json({ tasks });
});

const newTask = z.strictObject({
    title: z.string().trim().min(1),
});

app.post("/projects/:projectId/tasks", async (req, res) => {
    const projectId = req.params.projectId;

    const projects = await listProjectsForUser(res.locals.userId);
    const project = projects.find((p) => p.id === projectId);

    if (!project) {
        res.status(404).json({ error: "Not found" });
        return;
    }

    if (project.role !== "lead") {
        res.status(403).json({ error: "Only the project's Lead can do that" });
        return;
    }

    const body = newTask.safeParse(req.body);

    if (!body.success) {
        res.status(400).json({ error: "The request body is not valid", issues: body.error.issues });
        return;
    }

    const task = await createTask({ projectId, title: body.data.title });
    res.status(201).json({ task });
});

app.use((req, res) => {
    res.status(404).json({ error: "Not found" });
});

const handleErrors: ErrorRequestHandler = (error, req, res, next) => {
    if (error.type === "entity.parse.failed") {
        res.status(400).json({ error: "The request body is not valid JSON" });
        return;
    }

    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
};

app.use(handleErrors);