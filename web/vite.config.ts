import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        strictPort: true,
        // The browser asks this server for /api/...; it passes the request on to the API, so both look like one origin
        proxy: { "/api": "http://127.0.0.1:3000" },
    },
    test: {
        // A browser-like document for components to render into
        environment: "jsdom",
        setupFiles: ["./src/testing/setup.ts"],
    },
});
