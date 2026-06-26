/**
 * Bun.secrets API (OS keychain / libsecret / Credential Manager).
 * @see https://bun.sh/docs/api/secrets
 */
declare namespace Bun {
  interface SecretsOptions {
    readonly service: string;
    readonly name: string;
  }

  interface Secrets {
    get(options: SecretsOptions): Promise<string | null>;
    set(options: SecretsOptions, value: string): Promise<void>;
    delete(options: SecretsOptions): Promise<boolean>;
  }

  const secrets: Secrets;
}
