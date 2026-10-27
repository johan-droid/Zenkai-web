import { randomBytes, pbkdf2Sync, createHash } from "node:crypto";
import { Buffer } from "node:buffer";

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
export function encryptJson(
  passphrase: string,
  json: Record<string, any>
): { encrypted: string; salt: string } {
  const salt = generateSalt();
  const key = deriveKey(passphrase, salt);

  // AES-256-CBC: generate IV (16 bytes)
  const iv = randomBytes(16);

  // Perform encryption using Node crypto
  const crypto = require("node:crypto");
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);

  // Convert JSON to string, then encrypt
  const jsonString = JSON.stringify(json);
  let encrypted = cipher.update(jsonString, "utf8", "base64");
  encrypted += cipher.final("base64");

  // Encode: salt(base64) + ":" + iv(base64) + ":" + ciphertext(base64)
  const saltB64 = salt.toString("base64");
  const ivB64 = iv.toString("base64");
  const encryptedB64 = encrypted; // already base64 from cipher

  const fullEncrypted = `${saltB64}:${ivB64}:${encryptedB64}`;

  return {
    encrypted: fullEncrypted,
    salt: saltB64,
  };
}

/** Decrypt a JSON string using AES-256-CBC with PBKDF2-derived key */
function decryptJson(
  passphrase: string,
  encrypted: string
): Record<string, any> {
  const [saltB64, ivB64, ciphertextB64] = encrypted.split(":");
  const salt = Buffer.from(saltB64, "base64");
  const iv = Buffer.from(ivB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");

  const key = deriveKey(passphrase, salt);

  const crypto = require("node:crypto");
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);

  let decrypted = decipher.update(ciphertext.toString("utf8"), "utf8", "utf8");
  decrypted += decipher.final("utf8");

  return JSON.parse(decrypted);
}

/** Repository-style wrapper for user settings encryption */
export class SettingsEncryption {
  constructor(
    private readonly passphrase: string,
    // In production, this could be loaded from a KMS or HSM
    private readonly salt: Buffer = generateSalt()
  ) {}

  async encrypt(settings: Record<string, any>): Promise<string> {
    const { encrypted } = encryptJson(this.passphrase, settings);
    return encrypted;
  }

  async decrypt(encryptedBase64: string): Promise<Record<string, any>> {
    return decryptJson(this.passphrase, encryptedBase64);
  }
}