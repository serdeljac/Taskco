// The words a person reads for a routine. The API counts weekdays 1 to 7, Monday first, as ISO does

const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// [1, 2, 3, 4, 5] is "Weekdays"; any other set is its days in order, "Mon, Wed, Fri"
export function daysWords(weekdays: number[]): string {
    const days = [...new Set(weekdays)].sort((a, b) => a - b);
    const set = days.join(",");
    if (set === "1,2,3,4,5,6,7") {
        return "Every day";
    }
    if (set === "1,2,3,4,5") {
        return "Weekdays";
    }
    if (set === "6,7") {
        return "Weekends";
    }
    return days.map((day) => dayNames[day - 1]).join(", ");
}

// Today, for one routine: done, still to do, or a day off
export function todayWords(routine: { due_today: boolean; done_today: boolean }): string {
    if (routine.done_today) {
        return "Done today";
    }
    return routine.due_today ? "Due today" : "Not due today";
}

export function streakWords(streak: number): string {
    if (streak === 0) {
        return "No streak yet";
    }
    return streak === 1 ? "1 day in a row" : `${streak} days in a row`;
}