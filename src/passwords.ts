import { argon2, randomBytes, timingSafeEqual } from "node:crypto";

// How hard a hash is to make: memory in KiB, passes over it, and lanes. OWASP's minimum for Argon2id.
// Every stored hash records the settings it was made with, so raising these later leaves old passwords working
type Settings = { memory: number; passes: number; parallelism: number };

const current: Settings = { memory: 19456, passes: 2, parallelism: 1 };

function derive(password: string, salt: Buffer, settings: Settings, length: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        argon2(
            "argon2id",
            {
                message: password,
                nonce: salt,
                memory: settings.memory,
                passes: settings.passes,
                parallelism: settings.parallelism,
                tagLength: length,
            },
            (error, key) => (error ? reject(error) : resolve(key))
        );
    });
}

// Base64 without the trailing "=", as the PHC string format writes it
function encode(bytes: Buffer): string {
    return bytes.toString("base64").replace(/=+$/, "");
}

// The stored string names everything needed to check a password again:
// $argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>
export async function hashPassword(password: string, settings: Settings = current): Promise<string> {
    const salt = randomBytes(16);
    const key = await derive(password, salt, settings, 32);
    const { memory, passes, parallelism } = settings;
    return `$argon2id$v=19$m=${memory},t=${passes},p=${parallelism}$${encode(salt)}$${encode(key)}`;
}

const phc = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

// Hashes the password again with the stored salt and settings, and compares the two in constant time
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
    const parts = phc.exec(stored);

    if (!parts) {
        throw new Error("verifyPassword: the stored string is not an Argon2id hash");
    }

    const [, memory, passes, parallelism, salt, hash] = parts;
    const expected = Buffer.from(hash!, "base64");
    const settings = { memory: Number(memory), passes: Number(passes), parallelism: Number(parallelism) };
    const actual = await derive(password, Buffer.from(salt!, "base64"), settings, expected.length);

    return timingSafeEqual(actual, expected);
}

// A hash of no one's password. Checking a login for an email nobody has against it takes as long as a real
// check, so the time an answer takes does not say whether the account exists
let nobody: Promise<string> | undefined;

export function hashForNobody(): Promise<string> {
    nobody ??= hashPassword(randomBytes(32).toString("base64"));
    return nobody;
}
