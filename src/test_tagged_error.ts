import { Data } from "effect";

export class SecretError extends Data.TaggedError("SecretError")<{
	readonly cause: unknown;
	readonly namespace: string;
	readonly name: string;
}>() {}
