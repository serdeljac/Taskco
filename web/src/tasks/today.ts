// Today as a calendar day where the account lives, "2026-11-05": the same moment is a different day in
// Vancouver and in Zagreb, and "today" is always the asker's — design section 8. Its timezone comes
// from the account, not the browser's clock. "en-CA" writes a day year first, as a date input wants it
export function todayIn(timeZone: string, now: Date = new Date()): string {
    return new Intl.DateTimeFormat("en-CA", { timeZone }).format(now);
}
