import { vi } from "vitest";

// One answer: a status, and a body when there is one
export type Answer = [status: number, body?: unknown];

// Stands in for the API, one answer for each request, listed as "GET /account". A request given a
// function gets what the function returns at that moment, so a test can change an answer midway.
// Returns the stand-in, so a test can check what was asked. vite.config.ts puts the real fetch back
// before the next test
export function standInApi(answers: Record<string, Answer | (() => Answer)>) {
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
        const request = `${init?.method ?? "GET"} ${url.replace(/^\/api/, "")}`;
        const listed = answers[request];
        if (listed === undefined) {
            // The client turns this into "unreachable", so say plainly what happened
            console.error(`standInApi: no answer for ${request}`);
            throw new Error(`standInApi: no answer for ${request}`);
        }

        const [status, body] = typeof listed === "function" ? listed() : listed;
        return body === undefined ? new Response(null, { status }) : Response.json(body, { status });
    });
    vi.stubGlobal("fetch", fetch);
    return fetch;
}
