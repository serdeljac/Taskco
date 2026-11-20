import { useState } from "react";
import { useFetcher } from "react-router";
import type { Member } from "../api/types";

type Props = {
    project: { id: string; name: string };
    // Everyone in the project but its Lead
    members: Member[];
};

// One project the asker leads: its name, a member to hand it to, and Hand over, which asks first.
// The asker stays on as an Associate, so nothing is lost if the account is kept after all; if it
// goes, that membership ends with it. With nobody else in the project there is no one to hand to
export function HandOver({ project, members }: Props) {
    const fetcher = useFetcher<{ refusal?: string } | null>();
    const [asking, setAsking] = useState(false);
    const [toUserId, setToUserId] = useState(members[0]?.user_id ?? "");
    const nextLead = members.find((member) => member.user_id === toUserId)?.email;

    function startAsking() {
        fetcher.reset();
        setAsking(true);
    }

    return (
        <fetcher.Form method="post" onSubmit={() => setAsking(false)}>
            <strong>{project.name}</strong>
            <input type="hidden" name="intent" value="transfer" />
            <input type="hidden" name="projectId" value={project.id} />
            <label>
                New Lead for {project.name}
                <select
                    name="toUserId"
                    value={toUserId}
                    onChange={(event) => setToUserId(event.target.value)}
                    disabled={members.length === 0}
                >
                    {members.length === 0 ? (
                        <option value="">No members</option>
                    ) : (
                        members.map((member) => (
                            <option key={member.user_id} value={member.user_id}>
                                {member.email}
                            </option>
                        ))
                    )}
                </select>
            </label>
            {members.length > 0 &&
                (asking ? (
                    <>
                        <p role="alert">
                            Make {nextLead} the Lead of {project.name}? You stay on as an Associate.
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
                ))}
            {fetcher.data?.refusal && <p role="alert">{fetcher.data.refusal}</p>}
        </fetcher.Form>
    );
}