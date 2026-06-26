export const MASSEY_NAMESPACE = "com.bradley-terry.massey";
export const MASSEY_SECRET_NAME = "api-token";
export const DB_NAMESPACE = "com.bradley-terry.db";
export const DB_SECRET_NAME = "encryption-passphrase";

/** @deprecated Use `MASSEY_NAMESPACE` */
export const MASSEY_SECRET_SERVICE = MASSEY_NAMESPACE;
/** @deprecated Use `DB_NAMESPACE` */
export const DB_SECRET_SERVICE = DB_NAMESPACE;

export const formatNamespace = (namespace: string, name: string): string =>
  `${namespace}/${name}`;

/** Maps namespace+name → `Bun.secrets` `{ service, name }` options. */
export const bunSecretsOptions = (namespace: string, name: string) => ({
  service: namespace,
  name,
});
