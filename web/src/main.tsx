import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// Where the app starts: React takes over the empty <div id="root"> in index.html
createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <h1>Taskco</h1>
    </StrictMode>
);
