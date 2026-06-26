import { Context, Effect, Layer } from "effect";

export interface RatingsConfig {
  readonly masseyUrl: string;
  readonly dbPath: string;
  readonly interval: number;
  readonly port: number;
  readonly masseySecretService: string;
  readonly masseySecretName: string;
}

export class RatingsConfigTag extends Context.Tag("RatingsConfig")<
  RatingsConfigTag,
  RatingsConfig
>() {}

export const RatingsConfigLive = Layer.succeed(RatingsConfigTag, {
  get masseyUrl() {
    return process.env.MASSEY_URL ?? "https://masseyratings.com/data/json";
  },
  get dbPath() {
    return process.env.DB_PATH ?? "./data/ratings.db";
  },
  get interval() {
    return Number(process.env.REFRESH_INTERVAL ?? "3600");
  },
  get port() {
    return Number(process.env.PORT ?? "3000");
  },
  get masseySecretService() {
    return process.env.MASSEY_SECRET_SERVICE ?? "com.bradley-terry.massey";
  },
  get masseySecretName() {
    return process.env.MASSEY_SECRET_NAME ?? "api-token";
  },
});

export const getApiToken = (config: RatingsConfig) =>
  Effect.tryPromise({
    try: async () => {
      const fromEnv = process.env.MASSEY_API_TOKEN;
      if (fromEnv) return fromEnv;
      if (typeof Bun !== "undefined" && Bun.secrets) {
        return await Bun.secrets.get({
          service: config.masseySecretService,
          name: config.masseySecretName,
        });
      }
      return null;
    },
    catch: (cause) => cause,
  });
