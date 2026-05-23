import { compare } from 'bcrypt';

import config from '@/config';
import { ipRateLimiter } from '@/lib/ip-rate-limiter';
import { recordAuditLog } from '@/modules/audit/audit.service';
import { CustomError } from '@/utils/custom_error';
import { ErrorMessage } from '@/utils/enums/errors';
import { HttpStatus } from '@/utils/enums/http-status';

import type { CreateUserDto } from '../user/dto/create-user.dto';
import type { TokenDto } from './dto/create-token.dto';
import type { LoginUserDto } from './dto/login.dto';

import * as userService from '../user/user.service';
import * as jwtService from './jwt.service';

/**
 * Audit-хуки auth-модуля (доработка 5):
 *   — `auth.login` (успешный логин; userUid известен);
 *   — `auth.failed_login` (неверный пароль / неизвестный mail; userUid=null,
 *     в details — попытанный mail и IP — нужны для расследования
 *     брутфорса);
 *   — `auth.logout` (явный выход);
 *   — `auth.registered` (открытая регистрация — DEVELOPER через `/register`).
 *
 * Audit вызывается ПОСЛЕ основного действия — не блокирует ответ
 * пользователю; ошибки записи в журнал гасятся внутри `recordAuditLog`.
 *
 * Запись `auth.failed_login` НЕ может выдать секретную информацию (мы
 * пишем `mail`, который атакующий и так знает; не пишем пароль). IP —
 * стандартное поле для security-мониторинга.
 */

export const login = async (userData: LoginUserDto, ip: string) => {
  try {
    const user = await validateUser(userData, ip);
    const payload: TokenDto = {
      role: user.role,
      uid: user.uid
    };
    const data = { role: user.role };

    // Успешный логин — audit.
    await recordAuditLog({
      userUid: user.uid,
      action: 'auth.login',
      entityType: 'user',
      entityId: user.uid,
      details: { ip, role: user.role }
    });

    return { ...(await jwtService.createTokenAsync(payload)), data };
  } catch (error) {
    // Failed login — audit с null actor'ом (атакующий не идентифицирован).
    // Не пишем audit на технические ошибки (DB down и т.п.) — только на
    // CustomError 400/403, которые означают «не угадал пароль / нет юзера».
    if (
      error instanceof CustomError &&
      (error.statusCode === HttpStatus.BAD_REQUEST || error.statusCode === HttpStatus.FORBIDDEN)
    ) {
      await recordAuditLog({
        userUid: undefined,
        action: 'auth.failed_login',
        entityType: 'auth',
        // mail может отсутствовать в DTO (логин через phone); записываем то, что есть.
        details: {
          ip,
          attemptedMail: userData.mail ?? null,
          attemptedPhone: userData.phone ?? null,
          statusCode: error.statusCode
        }
      });
    }
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

    // Open registration — audit. Роль ВСЕГДА DEVELOPER (user.service форсирует),
    // но в details записываем явно, чтобы security-журнал был самодостаточным.
    await recordAuditLog({
      userUid: user.uid,
      action: 'auth.registered',
      entityType: 'user',
      entityId: user.uid,
      details: { mail: user.mail, role: user.role }
    });

    return { ...(await jwtService.createTokenAsync(payload)), data };
  } catch (error) {
    throw error;
  }
};

export const logout = async (uid: string) => {
  try {
    await jwtService.removeAllTokensByUid(uid);
    await recordAuditLog({
      userUid: uid,
      action: 'auth.logout',
      entityType: 'user',
      entityId: uid
    });
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
