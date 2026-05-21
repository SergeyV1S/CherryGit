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

const storeToken = async (data: IStoreToken) => {
  const key = `${data.userUid}:${data.token}`;
  const expiration = data.expiration * 60 * 60;
  await redisClient.SET(key, 'true', { EX: expiration });
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
    expiration: +config.jwt.refresh.expiresIn.replace('h', '')
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

