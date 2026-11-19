import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Encrypts what Postula keeps for a person and must never store in the clear: OAuth tokens of
 * their Gmail, API keys of a job board. AES-256-GCM with a fresh nonce per value; the key is
 * `deriveSecret(BETTER_AUTH_SECRET, "credentials")`, so a copy of the database alone reads
 * nothing. Third-party passwords are never stored, encrypted or not.
 *
 * The sealed text is `v1.<nonce>.<tag>.<ciphertext>` in base64url: the version lets the key or
 * the cipher change later without breaking what's stored.
 */
export function createSecretBox(key: string) {
  const keyBytes = Buffer.from(key, "base64url");
  if (keyBytes.length !== 32) throw new Error("The secret box needs a 32-byte key");

  return {
    seal(plain: string, context: string): string {
      const nonce = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", keyBytes, nonce);
      // The context (e.g. "gmail:<userId>") is authenticated: a value moved to another row fails.
      cipher.setAAD(Buffer.from(context));
      const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
      const parts = [nonce, cipher.getAuthTag(), data].map((part) => part.toString("base64url"));
      return `v1.${parts.join(".")}`;
    },
    open(sealed: string, context: string): string {
      const [version, nonce, tag, data] = sealed.split(".");
      if (version !== "v1" || !nonce || !tag || data === undefined) {
        throw new Error("Not a sealed value");
      }
      const decipher = createDecipheriv("aes-256-gcm", keyBytes, Buffer.from(nonce, "base64url"));
      decipher.setAAD(Buffer.from(context));
      decipher.setAuthTag(Buffer.from(tag, "base64url"));
      return Buffer.concat([
        decipher.update(Buffer.from(data, "base64url")),
        decipher.final(),
      ]).toString("utf8");
    },
  };
}

export type SecretBox = ReturnType<typeof createSecretBox>;
