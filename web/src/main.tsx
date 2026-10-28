import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ProjectList } from "./projects/ProjectList";

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <h1>Taskco</h1>
        <ProjectList
            projects={[
                { id: "1", name: "Website relaunch" },
                { id: "2", name: "Garden" },
            ]}
        />
    </StrictMode>
);