import type { ErrorBody } from "./types";

// A refusal, or no answer at all. The code chooses the words a person reads; the message is the
// server's sentence, for developers
export class ApiError extends Error {
    readonly status: number;
    readonly code: string;

    constructor(status: number, code: string, message: string) {
        super(message);
        this.name = "ApiError";
        this.status = status;
        this.code = code;
    }
}

// The one way a screen asks the API. path is the API's own, "/sessions", and body, when there is
// one, is sent as JSON. T is what the screen expects back: nothing checks it, so it must match the
// reference's tables
export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
    const init: RequestInit = { method };
    if (body !== undefined) {
        init.headers = { "Content-Type": "application/json" };
        init.body = JSON.stringify(body);
    }

    let response: Response;
    try {
        response = await fetch(`/api${path}`, init);
    } catch {
        // fetch fails only when nothing answers. A refusal arrives as a response, with ok false
        throw new ApiError(0, "unreachable", "Nothing answered");
    }

    if (!response.ok) {
        throw await refusalFrom(response);
    }

    // A 204 has no body, and reading one throws
    if (response.status === 204) {
        return undefined as T;
    }
    return (await response.json()) as T;
}

async function refusalFrom(response: Response): Promise<ApiError> {
    const body = (await response.json().catch(() => undefined)) as Partial<ErrorBody> | undefined;
    if (typeof body?.code === "string" && typeof body.error === "string") {
        return new ApiError(response.status, body.code, body.error);
    }

    // Not the API's answer. Vite's proxy answers 502, with no body, when the API is not running
    if (response.status === 502 || response.status === 503 || response.status === 504) {
        return new ApiError(response.status, "unreachable", "The API did not answer");
    }
    return new ApiError(response.status, "server-error", "The answer was not the API's");
}
