import { z } from 'zod';

import 'dotenv/config';

const envSchema = z.object({
  APPNAME: z.string(),
  PORT: z.string(),
  NODE_ENV: z.string(),
  LOCALE: z.string(),
  LOGIN_RATE_LIMITER_ATTEMPTS: z.string(),
  LOGIN_RATE_LIMITER_TIMER_M: z.string(),
  PRODUCTION_URL: z.string(),
  CLIENT_BASE_URL: z.string().url(),
  DATABASE_HOST: z.string(),
  DATABASE_PORT: z.string(),
  DATABASE_USER: z.string(),
  DATABASE_PASSWORD: z.string(),
  DATABASE_NAME: z.string(),
  DATABASE_URL: z.string().startsWith('postgresql://'),
  JWT_ACCESS_SECRET: z.string(),
  JWT_REFRESH_SECRET: z.string(),
  ACCESS_TOKEN_EXPIRES_IN: z.string(),
  REFRESH_TOKEN_EXPIRES_IN: z.string(),
  REDIS_HOST: z.string(),
  REDIS_PORT: z.string(),
  REDIS_PASSWORD: z.string(),

  /**
   * Ключ симметричного шифрования PAT-токенов GitLab (ВКР 2.2.3).
   * 64 hex-символа = 32 байта = AES-256.
   * Генерация: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   */
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .length(64, 'TOKEN_ENCRYPTION_KEY must be 32 bytes in hex (64 chars)'),

  /** Интервал между прогонами sync-планировщика в минутах. Пусто → 10 минут. */
  SYNC_INTERVAL_M: z.string().optional(),
  /** "true" чтобы запустить первый sync-tick сразу при старте приложения. */
  SYNC_RUN_ON_START: z.string().optional()
});

export const env = envSchema.parse(process.env);
