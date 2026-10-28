import { describe, expect, it, vi } from "vitest";
import { ApiError, api } from "./client";
import { standInFetch } from "../testing/standInFetch";

// What api() threw, checked to be an ApiError
async function refusalOf(answer: Promise<unknown>): Promise<ApiError> {
    const thrown = await answer.then(
        () => undefined,
        (error: unknown) => error
    );
    expect(thrown).toBeInstanceOf(ApiError);
    return thrown as ApiError;
}

describe("api", () => {
    it("sends the body as JSON to /api and the path, and gives back what came back", async () => {
        const fetch = standInFetch(201, { user: { id: "1", email: "lead@example.com" } });

        const answer = await api("POST", "/sessions", { email: "lead@example.com", password: "taskco-demo" });

        expect(answer).toEqual({ user: { id: "1", email: "lead@example.com" } });
        expect(fetch).toHaveBeenCalledWith("/api/sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: '{"email":"lead@example.com","password":"taskco-demo"}',
        });
    });

    it("sends no body and no content type when there is nothing to send", async () => {
        const fetch = standInFetch(200, { projects: [] });

        await api("GET", "/projects");

        expect(fetch.mock.calls[0]?.[1]).toStrictEqual({ method: "GET" });
    });

    it("reads no body from a 204", async () => {
        standInFetch(204);

        await expect(api("DELETE", "/sessions/current")).resolves.toBeUndefined();
    });

    it("throws a refusal as an ApiError, with its status, its code and the server's sentence", async () => {
        standInFetch(401, { error: "The email or password is wrong", code: "wrong-email-or-password" });

        const refusal = await refusalOf(api("POST", "/sessions", { email: "lead@example.com", password: "wrong" }));

        expect(refusal.status).toBe(401);
        expect(refusal.code).toBe("wrong-email-or-password");
        expect(refusal.message).toBe("The email or password is wrong");
    });

    it("calls it unreachable, with status 0, when nothing answers at all", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => {
                throw new TypeError("Failed to fetch");
            })
        );

        const refusal = await refusalOf(api("GET", "/account"));

        expect(refusal.status).toBe(0);
        expect(refusal.code).toBe("unreachable");
    });

    it("calls it unreachable when the dev server answers 502 for an API that is not running", async () => {
        standInFetch(502);

        const refusal = await refusalOf(api("GET", "/account"));

        expect(refusal.status).toBe(502);
        expect(refusal.code).toBe("unreachable");
    });

    it("calls any other answer without the API's body a server error", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response("<h1>Internal Server Error</h1>", { status: 500 }))
        );

        const refusal = await refusalOf(api("GET", "/account"));

        expect(refusal.status).toBe(500);
        expect(refusal.code).toBe("server-error");
    });
});
