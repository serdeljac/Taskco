import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        // The API's tests only. web/ has its own Vitest setup, in a browser-like environment
        include: ["src/**/*.test.ts"],
        setupFiles: ["./src/testing/setup.ts"],
        fileParallelism: false,
        reporters: ["verbose"],
    },
});
