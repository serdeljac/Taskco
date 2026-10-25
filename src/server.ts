import "dotenv/config";
import express from "express";
import { app } from "./app.js";

const port = 3000;

// The API answers under /api: the path a browser uses through Vite's proxy, and once Taskco is hosted.
// The tests import app directly, so they call it without the prefix
const server = express();
server.disable("x-powered-by");
server.use("/api", app);

// Anything outside /api names nothing. JSON, like every other answer, rather than Express's own page
server.use((req, res) => {
    res.status(404).json({ error: "Not found", code: "not-found" });
});

server.listen(port, "127.0.0.1", () => {
    console.log(`Taskco's API is listening on http://127.0.0.1:${port}/api`);
});
