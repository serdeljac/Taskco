import { useFetcher } from "react-router";
import styles from "./style/InviteMember.module.scss";

// Inviting, for the Lead: an address and Invite, sent through a fetcher to the project page's action
// with the intent "invite". The browser stops a blank address, and most that are not addresses. Once
// an invite is sent the page says so, and the field starts afresh: its key is the new invite's id.
// After a refusal the key is the same, so what was typed stays to be corrected
export function InviteMember() {
    const fetcher = useFetcher<{ refusal?: string; invited?: string; inviteId?: string } | null>();

    return (
        <fetcher.Form method="post" className={styles.invite}>
            <input type="hidden" name="intent" value="invite" />
            <label>
                Invite by email
                <input key={fetcher.data?.inviteId ?? "none"} type="email" name="email" required />
            </label>
            <button type="submit">Invite</button>
            {fetcher.data?.refusal && <p role="alert">{fetcher.data.refusal}</p>}
            {fetcher.data?.invited && <p role="status">Invited {fetcher.data.invited}. They have three days to accept.</p>}
        </fetcher.Form>
    );
}