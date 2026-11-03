import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, accessKeyState } from "@workspace/db";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const STATE_ID = 1;

export function generateAccessKey(): string {
  return Array.from(
    { length: 6 },
    () => ALPHABET[randomInt(ALPHABET.length)],
  ).join("");
}

export async function initializeAccessKeyState(): Promise<void> {
  await db
    .insert(accessKeyState)
    .values({
      id: STATE_ID,
      key: generateAccessKey(),
      updateOffset: 0,
    })
    .onConflictDoNothing({ target: accessKeyState.id });
}

export async function getAccessKeyState() {
  const [state] = await db
    .select()
    .from(accessKeyState)
    .where(eq(accessKeyState.id, STATE_ID))
    .limit(1);

  if (!state) {
    throw new Error("Access-key state has not been initialized.");
  }

  return state;
}

export async function replaceAccessKey(key: string): Promise<void> {
  await db
    .update(accessKeyState)
    .set({ key, updatedAt: new Date() })
    .where(eq(accessKeyState.id, STATE_ID));
}

export function keysMatch(given: string, current: string): boolean {
  const givenDigest = createHash("sha256").update(given).digest();
  const currentDigest = createHash("sha256").update(current).digest();
  return timingSafeEqual(givenDigest, currentDigest);
}

