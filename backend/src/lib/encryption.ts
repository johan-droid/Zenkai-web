import { randomBytes, pbkdf2Sync, createCipheriv, createDecipheriv } from "node:crypto";
import { Buffer } from "node:buffer";
import { config } from "../config/index.js";

/** 256-bit key derivation using PBKDF2 with SHA-256 */
const SALT_LENGTH = 16; // bytes
const ITERATIONS = 100_000; // memory-hard work factor
const KEY_LENGTH = 32; // 256 bits for AES-256

/** Derive an encryption key from a passphrase using PBKDF2 */
function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return pbkdf2Sync(passphrase, salt, ITERATIONS, KEY_LENGTH, "sha256");
}

/** Generate a random salt for key derivation */
export function generateSalt(): Buffer {
  return randomBytes(SALT_LENGTH);
}

/** Encrypt a JSON object using AES-256-CBC with PBKDF2-derived key */
export function encryptJson(
  passphrase: string,
  json: Record<string, any>
): { encrypted: string; salt: string } {
  const salt = generateSalt();
  const key = deriveKey(passphrase, salt);

  // AES-256-CBC: generate IV (16 bytes)
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", key, iv);

  // Convert JSON to string, then encrypt
  const jsonString = JSON.stringify(json);
  let encrypted = cipher.update(jsonString, "utf8", "base64");
  encrypted += cipher.final("base64");

  const saltB64 = salt.toString("base64");
  const ivB64 = iv.toString("base64");

  // Versioned envelope format: $enc$v1$<salt>$<iv>$<ciphertext>
  const fullEncrypted = `$enc$v1$${saltB64}$${ivB64}$${encrypted}`;

  return {
    encrypted: fullEncrypted,
    salt: saltB64,
  };
}

/** Decrypt a JSON string using AES-256-CBC with PBKDF2-derived key */
export function decryptJson(
  passphrase: string,
  encrypted: string
): Record<string, any> {
  let saltB64: string;
  let ivB64: string;
  let ciphertextB64: string;

  if (encrypted.startsWith("$enc$v1$")) {
    const parts = encrypted.slice("$enc$v1$".length).split("$");
    if (parts.length !== 3) {
      throw new Error("Invalid encrypted envelope format");
    }
    [saltB64, ivB64, ciphertextB64] = parts;
  } else {
    // Legacy colon-separated format
    const parts = encrypted.split(":");
    if (parts.length !== 3) {
      throw new Error("Invalid legacy encrypted format");
    }
    [saltB64, ivB64, ciphertextB64] = parts;
  }

  const salt = Buffer.from(saltB64, "base64");
  const iv = Buffer.from(ivB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");

  const key = deriveKey(passphrase, salt);
  const decipher = createDecipheriv("aes-256-cbc", key, iv);

  // Decrypt binary ciphertext buffer directly into UTF-8 plaintext without corrupting bytes
  let decrypted = decipher.update(ciphertext, undefined, "utf8");
  decrypted += decipher.final("utf8");

  return JSON.parse(decrypted);
}

/** Repository-style wrapper for user settings encryption */
export class SettingsEncryption {
  constructor(private readonly passphrase: string) {}

  async encrypt(settings: Record<string, any>): Promise<string> {
    const { encrypted } = encryptJson(this.passphrase, settings);
    return encrypted;
  }

  async decrypt(encryptedBase64: string): Promise<Record<string, any>> {
    return decryptJson(this.passphrase, encryptedBase64);
  }
}

/** Direct helpers for user settings encryption and decryption */
export function encryptUserSettings(
  settings: Record<string, any>,
  passphrase = config.SETTINGS_ENCRYPTION_PASSPHRASE
): string {
  const { encrypted } = encryptJson(passphrase, settings);
  return encrypted;
}

export function decryptUserSettings(
  encrypted: string | null | undefined,
  passphrase = config.SETTINGS_ENCRYPTION_PASSPHRASE
): Record<string, any> | null {
  if (!encrypted || typeof encrypted !== "string") return {};
  try {
    return decryptJson(passphrase, encrypted);
  } catch {
    return null;
  }
}