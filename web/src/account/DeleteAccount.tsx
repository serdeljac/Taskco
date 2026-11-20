import { useState } from "react";
import { useFetcher } from "react-router";
import styles from "./style/DeleteAccount.module.scss";

// Deleting the account: what happens, and a button that asks first. Going ahead ends every session,
// so the page's action goes on to /login. Logging in within thirty days brings the account back, and
// the projects it still led with it
export function DeleteAccount({ leading }: { leading: number }) {
    const fetcher = useFetcher<{ refusal?: string } | null>();
    const [asking, setAsking] = useState(false);

    function startAsking() {
        fetcher.reset();
        setAsking(true);
    }

    const projects =
        leading === 0 ? "" : leading === 1 ? " The project you still lead goes with it." : ` The ${leading} projects you still lead go with it.`;

    return (
        <section className={styles.deleteAccount} aria-labelledby="delete-account">
            <h2 id="delete-account">Delete your account</h2>
            <p>
                You are logged out, and your account is deleted in 30 days, with your routines. Log in before then to bring it
                back.
            </p>
            {asking ? (
                <fetcher.Form method="post" onSubmit={() => setAsking(false)}>
                    <p role="alert">Delete your account?{projects}</p>
                    <button type="submit" name="intent" value="delete-account">
                        Delete my account
                    </button>
                    <button type="button" onClick={() => setAsking(false)} autoFocus>
                        Cancel
                    </button>
                </fetcher.Form>
            ) : (
                <button type="button" onClick={startAsking}>
                    Delete account…
                </button>
            )}
            {fetcher.data?.refusal && (
                <p role="alert" className={styles.refusal}>
                    {fetcher.data.refusal}
                </p>
            )}
        </section>
    );
}