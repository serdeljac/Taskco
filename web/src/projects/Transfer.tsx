import { useState } from "react";
import { useFetcher } from "react-router";
import type { Member } from "../api/types";
import styles from "./style/Transfer.module.scss";

type Props = {
    projectName: string;
    // The members who could lead: everyone but the Lead
    associates: Member[];
};

// Handing the project over, for the Lead: who leads next, and whether the Lead stays on as an
// Associate or leaves. It asks first, since only the new Lead could hand it back. Sent through a
// fetcher to the project page's action with the intent "transfer"
export function Transfer({ projectName, associates }: Props) {
    const fetcher = useFetcher<{ refusal?: string } | null>();
    const [asking, setAsking] = useState(false);
    const [toUserId, setToUserId] = useState(associates[0]?.user_id ?? "");
    const [outgoing, setOutgoing] = useState<"stay" | "leave">("stay");

    const nextLead = associates.find((member) => member.user_id === toUserId)?.email;
    const after = outgoing === "stay" ? "You stay on as an Associate." : "You leave the project.";

    function startAsking() {
        fetcher.reset();
        setAsking(true);
    }

    return (
        <fetcher.Form method="post" onSubmit={() => setAsking(false)} className={styles.transfer}>
            <h3>Hand over the project</h3>
            <input type="hidden" name="intent" value="transfer" />
            <label>
                New Lead
                <select name="toUserId" value={toUserId} onChange={(event) => setToUserId(event.target.value)}>
                    {associates.map((member) => (
                        <option key={member.user_id} value={member.user_id}>
                            {member.email}
                        </option>
                    ))}
                </select>
            </label>
            <fieldset>
                <legend>Then you</legend>
                <label>
                    <input type="radio" name="outgoing" value="stay" checked={outgoing === "stay"} onChange={() => setOutgoing("stay")} />
                    Stay on as an Associate
                </label>
                <label>
                    <input type="radio" name="outgoing" value="leave" checked={outgoing === "leave"} onChange={() => setOutgoing("leave")} />
                    Leave the project
                </label>
            </fieldset>
            {asking ? (
                <>
                    <p role="alert">
                        Make {nextLead} the Lead of {projectName}? {after}
                    </p>
                    <button type="submit">Hand over</button>
                    <button type="button" onClick={() => setAsking(false)} autoFocus>
                        Cancel
                    </button>
                </>
            ) : (
                <button type="button" onClick={startAsking}>
                    Hand over…
                </button>
            )}
            {fetcher.data?.refusal && <p role="alert">{fetcher.data.refusal}</p>}
        </fetcher.Form>
    );
}