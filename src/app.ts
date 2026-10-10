import express from "express";
import { listProjectsForUser } from "./queries.js";

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