import { Context, Data, type Effect } from "effect";

export class SecretError extends Data.TaggedError("SecretError")<{
  readonly cause: unknown;
  readonly namespace: string;
  readonly name: string;
}> {}

export type SecretClientApi = {
  readonly get: (namespace: string, name: string) => Effect.Effect<string, SecretError>;
  readonly set: (
    namespace: string,
    name: string,
    value: string,
  ) => Effect.Effect<void, SecretError>;
  readonly delete: (namespace: string, name: string) => Effect.Effect<boolean, SecretError>;
};

export class SecretClient extends Context.Tag("SecretClient")<SecretClient, SecretClientApi>() {}

export const secretError = (cause: unknown, namespace: string, name: string) =>
  new SecretError({ cause, namespace, name });
