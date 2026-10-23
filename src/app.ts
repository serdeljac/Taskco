import express, { type ErrorRequestHandler, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { listProjectsForUser, listRoutines, listInvitesForUser, createProject, createRoutine, listTasks, createTask, deleteProject, restoreProject, deleteProjectNow, listMembers, removeMember, type ProjectForUser } from "./queries.js";
import { NotFound, Refused } from "./errors.js";

//Tells TypeScript what res.locals holds. Without this it’s any, which TypeScript never checks.
//project is set only by requireMember and requireLead, so only a route that names one of them may read it
declare global {
    namespace Express {
        interface Locals {
            userId: string;
            project: ProjectForUser;
        }
    }
}

//An id is 1 to 18 digits with no leading zero. Anything else would reach Postgres as an error, not as an id
const idPattern = /^[1-9][0-9]{0,17}$/;

//	Creates the app
export const app = express();

//Stops Express adding an X-Powered-By: Express header to every response
app.disable("x-powered-by");
app.use(express.json());

//Who is asking. This runs before every route. No header, or a header that isn’t an id → 401. Otherwise it stores the id and next() moves on to the route
app.use((req, res, next) => {
    const userId = req.get("X-User-Id");

    if (!userId || !idPattern.test(userId)) {
        res.status(401).json({ error: "Say who is asking" });
        return;
    }

    res.locals.userId = userId;
    next();
});

//An id in the path that cannot be an id names nothing: 404, before it can reach Postgres as an error
for (const name of ["projectId", "taskId", "subtaskId", "userId", "inviteId", "routineId"]) {
    app.param(name, (req, res, next, value) => {
        if (!idPattern.test(value)) {
            res.status(404).json({ error: "Not found" });
            return;
        }
        next();
    });
}

//The ids a path can name that lead to a project
type PathIds = { projectId?: string };

//May they? The project a request is about, as the asker sees it — with their role in it — or undefined when they cannot see it.
//It is looked up in the asker's own project list, so who can see a project stays written once, in listProjectsForUser
async function projectFor(params: PathIds, userId: string): Promise<ProjectForUser | undefined> {
    const projects = await listProjectsForUser(userId);
    return projects.find((p) => p.id === params.projectId);
}

//For anyone in the project. Someone who cannot see it gets 404: the same answer as a project that does not exist.
//Written as a generic function rather than a RequestHandler so the route after it keeps the exact types of its own path
async function requireMember<P extends PathIds>(req: Request<P>, res: Response, next: NextFunction): Promise<void> {
    const project = await projectFor(req.params, res.locals.userId);

    if (!project) {
        res.status(404).json({ error: "Not found" });
        return;
    }

    res.locals.project = project;
    next();
}

//For the Lead only. An Associate gets 403: they can already see the project, so "not found" would be a lie they can disprove
async function requireLead<P extends PathIds>(req: Request<P>, res: Response, next: NextFunction): Promise<void> {
    const project = await projectFor(req.params, res.locals.userId);

    if (!project) {
        res.status(404).json({ error: "Not found" });
        return;
    }

    if (project.role !== "lead") {
        res.status(403).json({ error: "Only the project's Lead can do that" });
        return;
    }

    res.locals.project = project;
    next();
}

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

app.get("/projects/:projectId/tasks", requireMember, async (req, res) => {
    const tasks = await listTasks({ projectId: res.locals.project.id, userId: res.locals.userId });
    res.json({ tasks });
});

const newTask = z.strictObject({
    title: z.string().trim().min(1),
    dueDate: z.iso.date().optional(),
});

app.post("/projects/:projectId/tasks", requireLead, async (req, res) => {
    const body = newTask.safeParse(req.body);

    if (!body.success) {
        res.status(400).json({ error: "The request body is not valid", issues: body.error.issues });
        return;
    }

    const task = await createTask({
        projectId: res.locals.project.id,
        title: body.data.title,
        dueDate: body.data.dueDate,
    });
    res.status(201).json({ task });
});

//Delete mode: thirty days in which the Lead can still undo it. The waiting deletion is its own small resource, so undoing it is a DELETE
app.post("/projects/:projectId/deletion", requireLead, async (req, res) => {
    const { scheduledFor } = await deleteProject(res.locals.project.id);
    res.status(201).json({ scheduledFor });
});

//The Lead still sees a project being deleted, inside its thirty days, so requireLead lets them through to undo it
app.delete("/projects/:projectId/deletion", requireLead, async (req, res) => {
    await restoreProject(res.locals.project.id);
    res.status(204).end();
});

//"Delete permanently now": a choice made instead of delete mode, so it is refused once delete mode has begun
app.delete("/projects/:projectId", requireLead, async (req, res) => {
    await deleteProjectNow(res.locals.project.id);
    res.status(204).end();
});

//Who is in the project now. Each member's membership_id is what a task's assignee is set to
app.get("/projects/:projectId/members", requireMember, async (req, res) => {
    const members = await listMembers({ projectId: res.locals.project.id, userId: res.locals.userId });
    res.json({ members });
});

//The Lead may remove anyone but themselves; anyone else may only remove themselves, which is leaving
app.delete("/projects/:projectId/members/:userId", requireMember, async (req, res) => {
    const userId = req.params.userId;
    const leaving = userId === res.locals.userId;

    if (res.locals.project.role !== "lead" && !leaving) {
        res.status(403).json({ error: "Only the project's Lead can do that" });
        return;
    }

    await removeMember({ projectId: res.locals.project.id, userId });
    res.status(204).end();
});

app.use((req, res) => {
    res.status(404).json({ error: "Not found" });
});

const handleErrors: ErrorRequestHandler = (error, req, res, next) => {
    if (error.type === "entity.parse.failed") {
        res.status(400).json({ error: "The request body is not valid JSON" });
        return;
    }

    if (error.type === "entity.too.large") {
        res.status(413).json({ error: "The request body is too large" });
        return;
    }

    if (error instanceof NotFound) {
        res.status(404).json({ error: "Not found" });
        return;
    }

    //A refusal's message starts with the function that refused, for whoever reads the terminal. The asker gets only the reason
    if (error instanceof Refused) {
        res.status(409).json({ error: error.message.replace(/^\w+: /, "") });
        return;
    }

    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
};

app.use(handleErrors);