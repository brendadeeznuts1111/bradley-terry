import { Data } from "effect";
import type { SecretError, SecretExpiredError, SecretNotFoundError } from "./secrets.js";

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
  | SecretError
  | SecretNotFoundError
  | SecretExpiredError;

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
    case "SecretExpiredError":
      return 401;
    case "SecretNotFoundError":
      return 503;
    case "SecretError":
      return 500;
  }
  return 500;
};

export const serviceErrorBody = (
  error: ServiceError
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
          `Bradley-Terry computation failed for ${error.teamCount} teams`
        ),
      };
    case "SchemaDecodeError":
      return {
        error: error._tag,
        message: "Upstream response did not match expected Massey schema",
      };
    case "SecretExpiredError":
      return {
        error: error._tag,
        message: `Secret ${error.service}/${error.name} has expired`,
      };
    case "SecretNotFoundError":
      return {
        error: error._tag,
        message: `Secret ${error.service}/${error.name} was not found`,
      };
    case "SecretError":
      return {
        error: error._tag,
        message: causeMessage(
          error.cause,
          `Failed to read secret ${error.service}/${error.name}`
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
