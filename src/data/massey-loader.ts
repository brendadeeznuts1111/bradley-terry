import { Data, Effect, Schema, Stream } from "effect";
import { type MatchRow, MatchRowSchema } from "../schema";

// ============================================
// Error Type
// ============================================

export class MasseyLoaderError extends Data.TaggedError("MasseyLoaderError")<{
	readonly message: string;
	readonly cause?: unknown;
}> {}

// ============================================
// Internal Helpers
// ============================================

/** Convert a Web ReadableStream<Uint8Array> into an async iterable of lines */
async function* readLinesAsync(
	stream: ReadableStream<Uint8Array>,
): AsyncIterable<string> {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let buffer = "";

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split(/\r?\n/);
			buffer = lines.pop() ?? ""; // keep incomplete line

			for (const line of lines) {
				yield line;
			}
		}

		if (buffer.length > 0) {
			yield buffer;
		}
	} finally {
		reader.releaseLock();
	}
}

/**
 * Parse a single Massey line.
 * Customize this function based on your actual Massey CSV format.
 * Current assumption: simple comma-separated with optional header.
 */
function parseMasseyLine(line: string): Partial<MatchRow> {
	const parts = line.split(",").map((p) => p.trim());

	if (parts.length < 4) {
		throw new Error(`Invalid Massey line: ${line}`);
	}

	return {
		home_team: parts[0],
		away_team: parts[1],
		winner_idx: Number(parts[2]) > Number(parts[3]) ? 0 : 1,
		loser_idx: Number(parts[2]) > Number(parts[3]) ? 1 : 0,
		date: parts[4] ?? new Date().toISOString().split("T")[0],
	};
}

// ============================================
// Public API
// ============================================

export const MasseyLoader = {
	/**
	 * Stream MatchRow records from a Massey CSV file.
	 * Backpressure-friendly and memory efficient.
	 */
	streamMatches: (
		filePath: string,
	): Stream.Stream<MatchRow, MasseyLoaderError> =>
		Stream.acquireRelease(
			Effect.sync(() => Bun.file(filePath).stream()),
			(stream) => Effect.sync(() => stream.cancel()),
		).pipe(
			Stream.flatMap((webStream) =>
				Stream.fromAsyncIterable(
					readLinesAsync(webStream),
					(err) =>
						new MasseyLoaderError({
							message: "Stream read failed",
							cause: err,
						}),
				),
			),
			Stream.filter((line) => line.trim().length > 0 && !line.startsWith("#")),
			Stream.drop(1), // skip header
			Stream.mapEffect((line) =>
				Effect.try({
					try: () => parseMasseyLine(line),
					catch: (err) =>
						new MasseyLoaderError({
							message: `Failed to parse Massey line: ${line}`,
							cause: err,
						}),
				}),
			),
			Stream.mapEffect((partial) =>
				Schema.decodeUnknown(MatchRowSchema)(partial).pipe(
					Effect.mapError(
						(err) =>
							new MasseyLoaderError({
								message: "MatchRow validation failed",
								cause: err,
							}),
					),
				),
			),
		),

	/**
	 * Convenience method: collect all matches into memory (use for smaller files)
	 */
	loadMatches: (filePath: string) =>
		Effect.runPromise(
			Stream.runCollect(MasseyLoader.streamMatches(filePath)).pipe(
				Effect.map((chunk) => Array.from(chunk)),
			),
		),
};
