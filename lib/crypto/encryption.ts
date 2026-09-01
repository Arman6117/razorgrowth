import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV recommended for AES-GCM
const AUTH_TAG_LENGTH = 16;

/**
 * Derives a 32-byte key for AES-256-GCM from environment configuration.
 */
function getEncryptionKey(): Buffer {
  const secret =
    process.env.RAZORPAY_CREDENTIAL_ENCRYPTION_KEY?.trim() ||
    process.env.AUTH_SECRET?.trim() ||
    process.env.RAZORPAY_WEBHOOK_SECRET?.trim();

  if (!secret) {
    // For buildathon development fallback, construct a deterministic key
    const devFallback = "razorgrowth_buildathon_vault_dev_key_2026";
    return crypto.createHash("sha256").update(devFallback).digest();
  }

  return crypto.createHash("sha256").update(secret).digest();
}

/**
 * Encrypts a plaintext secret using AES-256-GCM.
 * Output format: `${ivHex}:${authTagHex}:${encryptedDataHex}`
 */
export function encryptSecret(plaintext: string): string {
  if (!plaintext) return "";

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

/**
 * Decrypts an AES-256-GCM encrypted payload.
 */
export function decryptSecret(encryptedPayload: string): string {
  if (!encryptedPayload || !encryptedPayload.includes(":")) {
    return "";
  }

  const parts = encryptedPayload.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted payload format");
  }

  const [ivHex, authTagHex, encryptedDataHex] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedDataHex, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
