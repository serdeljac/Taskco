import { Navigate, useRouteError } from "react-router";
import { ApiError } from "./api/client";
import { wordsFor } from "./api/words";

// Where every error that no page handles ends up. A 401 means the session is over, so it goes to
// /login. Anything else is one plain sentence, not React Router's page for developers
export function RootError() {
    const error = useRouteError();

    if (error instanceof ApiError && error.status === 401) {
        return <Navigate to="/login" replace />;
    }

    const code = error instanceof ApiError ? error.code : "server-error";
    return <p role="alert">{wordsFor(code)}</p>;
}
