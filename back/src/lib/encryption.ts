import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import config from '@/config';

/**
 * Симметричное шифрование секретов (ВКР 2.2.3).
 * Используется для PAT-токенов GitLab перед сохранением в gitlab_connections.encryptedToken.
 *
 * Алгоритм: AES-256-GCM (auth tag защищает от подмены шифротекста).
 * Формат хранения: base64(iv | authTag | ciphertext), без разделителей —
 * длины iv (12) и authTag (16) фиксированы для GCM.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

/** hex → Uint8Array<ArrayBuffer>. Использует прямой парсинг, чтобы тип буфера был обычным ArrayBuffer. */
const getKey = (): Uint8Array => {
  const hex = config.encryption.tokenKey;
  const out = new Uint8Array(KEY_LENGTH);
  for (let i = 0; i < KEY_LENGTH; i++) {
    out[i] = Number.parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return out;
};

/** Buffer → копия как Uint8Array<ArrayBuffer> (узкий тип, ожидаемый crypto API Node 22). */
const toU8 = (b: Buffer): Uint8Array => {
  const out = new Uint8Array(b.length);
  out.set(b);
  return out;
};

/** Конкатенация Uint8Array (Buffer.concat не подходит из-за generic ArrayBufferLike). */
const concat = (...parts: Uint8Array[]): Uint8Array => {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
};

const toBase64 = (u8: Uint8Array): string => Buffer.from(u8).toString('base64');
const fromBase64 = (b64: string): Uint8Array => toU8(Buffer.from(b64, 'base64'));
const utf8Decode = (u8: Uint8Array): string => Buffer.from(u8).toString('utf8');

export const encryptSecret = (plaintext: string): string => {
  const iv = toU8(randomBytes(IV_LENGTH));
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);

  const encrypted = concat(toU8(cipher.update(plaintext, 'utf8')), toU8(cipher.final()));
  const authTag = toU8(cipher.getAuthTag());

  return toBase64(concat(iv, authTag, encrypted));
};

export const decryptSecret = (payload: string): string => {
  const buf = fromBase64(payload);
  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);

  const plain = concat(toU8(decipher.update(ciphertext)), toU8(decipher.final()));
  return utf8Decode(plain);
};
