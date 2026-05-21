import { compare } from 'bcrypt';

import config from '@/config';
import { ipRateLimiter } from '@/lib/ip-rate-limiter';
import { CustomError } from '@/utils/custom_error';
import { ErrorMessage } from '@/utils/enums/errors';
import { HttpStatus } from '@/utils/enums/http-status';

import type { CreateUserDto } from '../user/dto/create-user.dto';
import type { TokenDto } from './dto/create-token.dto';
import type { LoginUserDto } from './dto/login.dto';

import * as userService from '../user/user.service';
import * as jwtService from './jwt.service';

export const login = async (userData: LoginUserDto, ip: string) => {
  try {
    const user = await validateUser(userData, ip);
    const payload: TokenDto = {
      role: user.role,
      uid: user.uid
    };
    const data = { role: user.role };
    return { ...(await jwtService.createTokenAsync(payload)), data };
  } catch (error) {
    throw error;
  }
};

export const register = async (userData: CreateUserDto) => {
  try {
    const user = await userService.createUser(userData);
    const payload: TokenDto = {
      role: user.role,
      uid: user.uid
    };
    const data = { role: user.role };
    return { ...(await jwtService.createTokenAsync(payload)), data };
  } catch (error) {
    throw error;
  }
};

export const logout = async (uid: string) => {
  try {
    await jwtService.removeAllTokensByUid(uid);
    return true;
  } catch (error) {
    throw error;
  }
};

export const refresh = async (refreshToken: string) => {
  try {
    const result = await jwtService.getToken(refreshToken);
    if (!result) {
      throw new CustomError(HttpStatus.UNAUTHORIZED);
    }
    const [userUid] = result[0].split(':');
    const user = await userService.getUserByUID(userUid);
    const tokens = await jwtService.createTokenAsync({
      uid: userUid,
      role: user.role
    });
    await jwtService.removeToken(result[0]);
    return tokens;
  } catch (error) {
    if (error.statusCode === HttpStatus.INTERNAL_SERVER_ERROR) {
      throw new CustomError(HttpStatus.INTERNAL_SERVER_ERROR);
    }
    throw error;
  }
};

const validateUser = async (userData: LoginUserDto, ip: string) => {
  try {
    const user = await userService.getUserByLoginData(userData);

    if (!user || user.password == null) {
      throw new CustomError(HttpStatus.BAD_REQUEST, ErrorMessage.ERROR_AUTHORIZATION);
    }
    const passwordEquals = await compare(userData.password, user.password);

    if (user && passwordEquals) {
      const { password, ...result } = user;
      await jwtService.removeToken(`rate-limiter:login-${ip}`);
      return result;
    } else if (user && !passwordEquals) {
      const rateLimiter = await ipRateLimiter(
        'rate-limiter:login',
        ip,
        config.app.rateLimiterSettings.loginAttempts,
        config.app.rateLimiterSettings.loginTimer
      );
      if (rateLimiter.result) {
        const errorMessage =
          ErrorMessage.ERROR_LOGIN_VALIDATION.toString() + rateLimiter.attemptsLeft;
        throw new CustomError(HttpStatus.FORBIDDEN, errorMessage);
      }
    }
    throw new CustomError(HttpStatus.BAD_REQUEST);
  } catch (error) {
    throw error;
  }
};

