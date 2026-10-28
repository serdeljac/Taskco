import { vi } from "vitest";

// Stands in for fetch, answering every request with this status and body, the way the API would.
// Returns the stand-in, so a test can check what was asked. vite.config.ts puts the real fetch back
// before the next test
export function standInFetch(status: number, body?: unknown) {
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) =>
        body === undefined ? new Response(null, { status }) : Response.json(body, { status })
    );
    vi.stubGlobal("fetch", fetch);
    return fetch;
}
