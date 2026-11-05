import { isRouteErrorResponse, Link, Navigate, useRouteError } from "react-router";
import { ApiError } from "./api/client";
import { wordsFor } from "./api/words";

// Where every error that no page handles ends up. A 401 means the session is over, so it goes to
// /login. An address that names no page is React Router's own 404, not a failure, so it says so and
// offers a way back. Anything else is one plain sentence, not React Router's page for developers
export function RootError() {
    const error = useRouteError();

    if (error instanceof ApiError && error.status === 401) {
        return <Navigate to="/login" replace />;
    }

    if (isRouteErrorResponse(error) && error.status === 404) {
        return (
            <>
                <p>There's no page here.</p>
                <Link to="/">Go to your projects</Link>
            </>
        );
    }

    const code = error instanceof ApiError ? error.code : "server-error";
    return <p role="alert">{wordsFor(code)}</p>;
}
