import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        strictPort: true,
        proxy: {
            "/api": "http://127.0.0.1:3000",
        },
    },
    test: {
        environment: "jsdom",
        setupFiles: ["./src/testing/setup.ts"],
        // A fetch a test replaced goes back to the real one before the next test
        unstubGlobals: true,
    },
});