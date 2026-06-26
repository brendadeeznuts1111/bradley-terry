import { Data } from "effect";
import type { SecretError } from "../secrets/client.js";

export class MasseyFetchError extends Data.TaggedError("MasseyFetchError")<{
  readonly cause: unknown;
  readonly url: string;
}> {}

export class DBError extends Data.TaggedError("DBError")<{
  readonly cause: unknown;
  readonly operation: string;
}> {}

export class BTComputationError extends Data.TaggedError("BTComputationError")<{
  readonly cause: unknown;
  readonly teamCount: number;
}> {}

export class SchemaDecodeError extends Data.TaggedError("SchemaDecodeError")<{
  readonly cause: unknown;
  readonly input: unknown;
}> {}

export type ServiceError =
  | MasseyFetchError
  | DBError
  | BTComputationError
  | SchemaDecodeError
  | SecretError;

const causeMessage = (cause: unknown, fallback: string): string =>
  cause instanceof Error ? cause.message : fallback;

export const serviceErrorStatus = (error: ServiceError): number => {
  switch (error._tag) {
    case "MasseyFetchError":
      return 502;
    case "SchemaDecodeError":
      return 400;
    case "BTComputationError":
      return 422;
    case "SecretError": {
      const msg = causeMessage(error.cause, "");
      if (msg.includes("expired")) return 401;
      if (msg.includes("not found")) return 503;
      return 500;
    }
  }
  return 500;
};

export const serviceErrorBody = (
  error: ServiceError,
): { readonly error: string; readonly message: string } => {
  switch (error._tag) {
    case "MasseyFetchError":
      return {
        error: error._tag,
        message: causeMessage(error.cause, `Failed to fetch Massey data from ${error.url}`),
      };
    case "DBError":
      return {
        error: error._tag,
        message: causeMessage(error.cause, `Database operation "${error.operation}" failed`),
      };
    case "BTComputationError":
      return {
        error: error._tag,
        message: causeMessage(
          error.cause,
          `Bradley-Terry computation failed for ${error.teamCount} teams`,
        ),
      };
    case "SchemaDecodeError":
      return {
        error: error._tag,
        message: "Upstream response did not match expected Massey schema",
      };
    case "SecretError":
      return {
        error: error._tag,
        message: causeMessage(
          error.cause,
          `Failed to access secret ${error.namespace}/${error.name}`,
        ),
      };
    default:
      return { error: "UnknownError", message: "Internal server error" };
  }
};

export const isServiceError = (error: unknown): error is ServiceError =>
  typeof error === "object" &&
  error !== null &&
  "_tag" in error &&
  typeof (error as { _tag: unknown })._tag === "string";
