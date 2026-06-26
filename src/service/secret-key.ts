/** Matches `Bun.SecretsOptions` — reverse-domain `service` + short `name`. */
export interface SecretKey {
  readonly service: string;
  readonly name: string;
}

export const secretKey = (service: string, name: string): SecretKey => ({
  service,
  name,
});

export const formatSecretKey = (key: SecretKey): string => `${key.service}/${key.name}`;
