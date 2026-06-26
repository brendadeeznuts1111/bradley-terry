import { Data } from "effect";

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
  | SchemaDecodeError;
