export function countStreak(log: {
    today: string;
    started: string;
    weekdays: number[];
    doneOn: string[];
}): number {
    const done = new Set(log.doneOn);
    let streak = 0;

    for (let day = log.today; day >= log.started; day = previousDay(day)) {
        if (!log.weekdays.includes(isoWeekday(day))) {
            continue;
        }

        if (done.has(day)) {
            streak++;
        } else if (day !== log.today) {
            break;
        }
    }

    return streak;
}

function previousDay(day: string): string {
    const date = new Date(`${day}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - 1);
    return date.toISOString().slice(0, 10);
}

function isoWeekday(day: string): number {
    const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
    return weekday === 0 ? 7 : weekday;
}

