import * as jwt from 'jsonwebtoken';
import { v4 } from 'uuid';

import config from '@/config';
import redisClient from '@/db/redis';

import type { TokenDto } from './dto/create-token.dto';

interface IStoreToken {
  expiration: number;
  token: string;
  userUid: string;
}

export const storeCustomValue = async (keyName: string, value: any, expiration: number) => {
  await redisClient.SET(keyName, value, { EX: expiration });
};

export const getCustomValue = async (keyName: string) => {
  const res = await redisClient.GET(keyName);
  return res;
};

/**
 * Парсит строку длительности вида "168h", "7d", "30m", "3600s" в секунды.
 * Пример: "168h" → 604800, "7d" → 604800, "30m" → 1800.
 * Если формат не распознан — бросает ошибку (не даём Redis-ключу жить вечно).
 */
const parseDurationToSeconds = (duration: string): number => {
  const match = /^(\d+(?:\.\d+)?)\s*([smhd])$/.exec(duration.trim().toLowerCase());
  if (!match) {
    throw new Error(
      `Invalid duration format: "${duration}". Expected format: "168h", "7d", "30m", "3600s"`
    );
  }
  const value = Number.parseFloat(match[1]);
  const unit = match[2];
  const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return Math.round(value * multipliers[unit]);
};

const storeToken = async (data: IStoreToken) => {
  const key = `${data.userUid}:${data.token}`;
  await redisClient.SET(key, 'true', { EX: data.expiration });
};

export const createTokenAsync = async (tokenDto: TokenDto) => {
  const refresh = v4();
  const res = {
    token: jwt.sign(tokenDto, config.jwt.access.secret, {
      expiresIn: config.jwt.access.expiresIn,
      subject: 'access'
    }),
    refresh
  };

  await storeToken({
    token: refresh,
    userUid: tokenDto.uid,
    expiration: parseDurationToSeconds(config.jwt.refresh.expiresIn)
  });
  return res;
};

export const getToken = async (token: string) => {
  const res = await redisClient.KEYS(`*:${token}`);
  if (res.length !== 1) {
    return null;
  }
  return res;
};

export const removeToken = async (key: string): Promise<boolean> => {
  const res = await redisClient.DEL([key]);
  if (!res) {
    return false;
  }
  return true;
};

export const removeAllTokensByUid = async (uid: string) => {
  const keys = await redisClient.KEYS(`${uid}:*`);

  if (keys.length === 0) {
    return true;
  }

  const multi = redisClient.multi();
  keys.forEach((key) => {
    multi.DEL(key);
  });

  await multi.exec();
};
