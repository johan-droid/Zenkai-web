import { pbkdf2, randomBytes } from "node:crypto";
import { createHash } from "node:crypto";
import { encode as base64Encode, decode as base64Decode } from "node:base64-js";

/** 256-bit key derivation using PBKDF2 with SHA-256 */
const SALT_LENGTH = 16; // bytes
const ITERATIONS = 100_000; // memory-hard work factor
const KEY_LENGTH = 32; // 256 bits for AES-256

/** Derive a encryption key from a passphrase using PBKDF2 */
function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return pbkdf2Sync(passphrase, salt, ITERATIONS, KEY_LENGTH, "sha256");
}

/** Generate a random salt for key derivation */
export function generateSalt(): Buffer {
  return randomBytes(SALT_LENGTH);
}

/** Encrypt a JSON string using AES-256-CBC with PBKDF2-derived key */
export async function encryptJson(
  passphrase: string,
  json: Record<string, any>
): Promise<{ encrypted: string; salt: string }> {
  const salt = generateSalt();
  const key = deriveKey(passphrase, salt);

  // AES-256-CBC encryption using the key
  const iv = randomBytes(16); // 16-byte IV for CBC mode
  const cipher = createHash("sha256"); // We'll use a simple approach

  // Since Node crypto's crypto module for AES requires additional setup,
  // we'll use a simpler approach: encrypt with OpenSSL-compatible format
  // For production, consider using the 'crypto' module with createCipheriv

  // Encode: salt(base64) + iv(base64) + ciphertext(base64)
  const jsonString = JSON.stringify(json);
  const encryptedBytes = encryptWithAES256CBC(
    Buffer.from(jsonString, "utf8"),
    key,
    iv
  );

  const encryptedBase64 = encryptedBytes.toString("base64");
  const ivBase64 = iv.toString("base64");
  const saltBase64 = salt.toString("base64");

  return {
    encrypted: `${saltBase64}:${ivBase64}:${encryptedBase64}`,
    salt: saltBase64,
  };
}

/** Decrypt a JSON string using AES-256-CBC with PBKDF2-derived key */
export async function decryptJson(
  passphrase: string,
  encrypted: string
): Promise<Record<string, any>> {
  const [saltB64, ivB64, ciphertextB64] = encrypted.split(":");
  const salt = base64Decode(saltB64);
  const iv = base64Decode(ivB64);
  const ciphertext = base64Decode(ciphertextB64);

  const key = deriveKey(passphrase, salt);

  const decryptedBytes = decryptWithAES256CBC(ciphertext, key, iv);
  const jsonString = decryptedBytes.toString("utf8");

  return JSON.parse(jsonString);
}

/** AES-256-CBC encryption (internal) */
function encryptWithAES256CBC(
  data: Buffer,
  key: Buffer,
  iv: Buffer
): Buffer {
  // Use Node's crypto module for AES-256-CBC
  const crypto = require("node:crypto");
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(data, "utf8", "base64");
  encrypted += cipher.final("base64");
  // Return as base64 string that we'll decode later
  return Buffer.from(encrypted, "base64");
}

/** AES-256-CBC decryption (internal) */
function decryptWithAES256CBC(
  data: Buffer,
  key: Buffer,
  iv: Buffer
): Buffer {
  const crypto = require("node:crypto");
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  let decrypted = decipher.update(data.toString(), "base64", "utf8");
  decrypted += decipher.final("utf8");
  return Buffer.from(decrypted);
}

/** Repository-style wrapper for user settings encryption */
export class SettingsEncryption {
  constructor(
    private readonly passphrase: string,
    // In production, this could be loaded from a KMS or HSM
    private readonly salt: Buffer = generateSalt()
  ) {}

  async encrypt(settings: Record<string, any>): Promise<string> {
    const { encrypted } = await encryptJson(this.passphrase, settings);
    return encrypted;
  }

  async decrypt(encryptedBase64: string): Promise<Record<string, any>> {
    return await decryptJson(this.passphrase, encryptedBase64);
  }
}