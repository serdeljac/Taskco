import { useFetcher } from "react-router";
import type { Invite } from "../api/types";
import styles from "./style/Invites.module.scss";

// The invites waiting for the person logged in, above their projects. Nothing shows when there are
// none: an empty "Invites" would be a heading about nothing
export function Invites({ invites }: { invites: Invite[] }) {
    if (invites.length === 0) {
        return null;
    }

    return (
        <>
            <h2 id="invites">Invites</h2>
            <ul aria-labelledby="invites" className={styles.invites}>
                {invites.map((invite) => (
                    <InviteRow key={invite.id} invite={invite} />
                ))}
            </ul>
        </>
    );
}

// One invite, with a fetcher of its own, so a refusal shows beside the invite it is about. Each
// button sends its intent as its value, and names the project, so a screen reader can tell two
// invites' buttons apart. Sent to /'s action
function InviteRow({ invite }: { invite: Invite }) {
    const fetcher = useFetcher<{ refusal?: string } | null>();

    return (
        <li>
            <fetcher.Form method="post">
                <span>
                    {invite.project_name}, from {invite.invited_by_email}
                </span>
                <input type="hidden" name="inviteId" value={invite.id} />
                <button type="submit" name="intent" value="accept-invite" aria-label={`Accept ${invite.project_name}`}>
                    Accept
                </button>
                <button type="submit" name="intent" value="decline-invite" aria-label={`Decline ${invite.project_name}`}>
                    Decline
                </button>
                {fetcher.data?.refusal && <p role="alert">{fetcher.data.refusal}</p>}
            </fetcher.Form>
        </li>
    );
}