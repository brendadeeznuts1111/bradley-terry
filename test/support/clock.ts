/**
 * Deterministic clock helpers for bun:test.
 *
 * `setSystemTime` freezes the system clock to a specific date so
 * Date.now(), new Date(), and TTL expiry math are predictable.
 * Call the returned reset function to restore the real clock.
 */
import { setSystemTime } from "bun:test";

export function seedDeterministicClock(
	date: Date = new Date("2024-01-01T00:00:00Z"),
): () => void {
	setSystemTime(date);
	return () => setSystemTime();
}
