import type { CorsOptions } from 'cors';

import { env } from './env';

const isProduction = env.NODE_ENV === 'prod';
const isLocale = env.LOCALE === 'true';

export default {
  app: {
    name: env.APPNAME,
    isProduction,
    isLocale,
    port: env.PORT || 8080,
    productionUrl: env.PRODUCTION_URL || `localhost:${env.PORT}`,
    rateLimiterSettings: {
      loginAttempts: +env.LOGIN_RATE_LIMITER_ATTEMPTS,
      loginTimer: +env.LOGIN_RATE_LIMITER_TIMER_M
    }
  },
  cors: {
    origin: ['http://localhost:8080', 'http://127.0.0.1:8080', env.CLIENT_BASE_URL],
    credentials: true
  } as CorsOptions,
  database: {
    postgres: {
      host: env.DATABASE_HOST,
      port: env.DATABASE_PORT,
      user: env.DATABASE_USER,
      password: env.DATABASE_PASSWORD,
      database: env.DATABASE_NAME,
      url: env.DATABASE_URL
    },
    redis: {
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD
    }
  },
  jwt: {
    access: {
      secret: env.JWT_ACCESS_SECRET,
      expiresIn: env.ACCESS_TOKEN_EXPIRES_IN
    },
    refresh: {
      secret: env.JWT_REFRESH_SECRET,
      expiresIn: env.REFRESH_TOKEN_EXPIRES_IN
    }
  },
  encryption: {
    tokenKey: env.TOKEN_ENCRYPTION_KEY
  },
  sync: {
    intervalMs: (env.SYNC_INTERVAL_M ? Number(env.SYNC_INTERVAL_M) : 10) * 60 * 1000,
    runOnStart: env.SYNC_RUN_ON_START === 'true'
  }
} as const;
