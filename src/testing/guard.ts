export function isTestDatabase(url: string): boolean {
    const databaseName = new URL(url).pathname.slice(1);
    return databaseName.endsWith("_test");
}