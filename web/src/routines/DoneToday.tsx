import { useFetcher } from "react-router";
import styles from "./style/DoneToday.module.scss";

type Props = {
    routine: { id: string; name: string; due_today: boolean; done_today: boolean };
};

// Today, for one routine: Done once it is done, Undo after. A day the routine is not for has
// neither, since doing it then would not count. Each routine has its own fetcher, so pressing one
// leaves the others as they are; the page reloads after, with the streak counted again. The
// server dates it on the owner's calendar, so nothing here says which day
export function DoneToday({ routine }: Props) {
    const fetcher = useFetcher<{ refusal?: string } | null>();

    if (!routine.done_today && !routine.due_today) {
        return null;
    }

    return (
        <fetcher.Form method="post" className={styles.doneToday}>
            <input type="hidden" name="routineId" value={routine.id} />
            {routine.done_today ? (
                <button type="submit" name="intent" value="undo-today" aria-label={`Undo ${routine.name} for today`}>
                    Undo
                </button>
            ) : (
                <button type="submit" name="intent" value="done-today" aria-label={`Mark ${routine.name} done today`}>
                    Done
                </button>
            )}
            {fetcher.data?.refusal && <p role="alert">{fetcher.data.refusal}</p>}
        </fetcher.Form>
    );
}