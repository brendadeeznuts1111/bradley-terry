import { ManagedRuntime } from "effect";
import { AppLive } from "../service/index.js";

let runtime:
  | ManagedRuntime.ManagedRuntime<ManagedRuntime.ManagedRuntime.Context<typeof AppLive>>
  | undefined;

/** Lazily-built runtime; AppLive (incl. scoped RatingsDB) stays alive for server lifetime. */
export const getAppRuntime = () => {
  if (!runtime) {
    runtime = ManagedRuntime.make(AppLive);
  }
  return runtime;
};

/** Reset runtime between tests when env/config must be re-read. */
export const disposeAppRuntime = (): Promise<void> => {
  const current = runtime;
  runtime = undefined;
  return current?.dispose() ?? Promise.resolve();
};
