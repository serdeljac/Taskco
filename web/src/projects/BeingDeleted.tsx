import { Link, useFetcher, useRouteLoaderData } from "react-router";
import type { accountLoader } from "../account/AccountLayout";
import styles from "./style/BeingDeleted.module.scss";

type Props = {
    projectName: string;
    // The moment it goes, as the API sends it: "2026-12-19T10:00:00.000Z"
    scheduledFor: string;
};

// The page of a project being deleted, which only its Lead can open: the banner, and nothing else.
// The API answers its tasks with none and refuses every change, so there is nothing to show but the
// day it goes, in the Lead's own timezone, and Undo
export function BeingDeleted({ projectName, scheduledFor }: Props) {
    const fetcher = useFetcher<{ refusal?: string } | null>();
    const account = useRouteLoaderData<typeof accountLoader>("account");
    const day = new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: account?.user.timezone }).format(
        new Date(scheduledFor)
    );

    return (
        <>
            <p>
                <Link to="/">All projects</Link>
            </p>
            <h1>{projectName}</h1>
            <fetcher.Form method="post" className={styles.banner}>
                <p>
                    {projectName} will be deleted on {day}. Until then you can undo it.
                </p>
                <button type="submit" name="intent" value="undo-deletion">
                    Undo
                </button>
                {fetcher.data?.refusal && <p role="alert">{fetcher.data.refusal}</p>}
            </fetcher.Form>
        </>
    );
}