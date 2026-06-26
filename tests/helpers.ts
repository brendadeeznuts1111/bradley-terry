import { setSystemTime } from "bun:test";

/**
 * Pin the system clock for deterministic TTL / timestamp tests.
 * Call the returned function to restore real time.
 */
export function seedDeterministicClock(date: Date = new Date("2024-01-01T00:00:00Z")): () => void {
  setSystemTime(date);
  return () => setSystemTime();
}
