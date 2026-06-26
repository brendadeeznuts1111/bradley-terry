/**
 * Module augmentation for `Bun.secrets`.
 *
 * Bun exposes a secure, OS-backed credential store via `Bun.secrets.get()`,
 * `Bun.secrets.set()`, and `Bun.secrets.delete()`. Secrets are scoped by a
 * `service` namespace and a `name` key, providing data isolation without
 * process-level sandboxing.
 *
 * This declaration augments the `bun` module so `Bun.secrets` is available
 * without casting through `unknown` or `any`.
 */
declare module "bun" {
	interface SecretsOptions {
		service: string;
		name: string;
	}

	interface Secrets {
		get(options: SecretsOptions): Promise<string | null>;
		set(options: SecretsOptions, value: string): Promise<void>;
		delete(options: SecretsOptions): Promise<boolean>;
	}

	const secrets: Secrets;
}
