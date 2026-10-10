import "dotenv/config";
import { app } from "./app.js";

const port = 3000;

app.listen(port, "127.0.0.1", () => {
    console.log(`Taskco is listening on http://127.0.0.1:${port}`);
});