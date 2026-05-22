import { hash } from 'bcrypt';
import { eq, or } from 'drizzle-orm';

import { db } from '@/db/drizzle/connect';
import { users } from '@/db/drizzle/schema/user/schema';
import { CustomError } from '@/utils/custom_error';
import { HttpStatus } from '@/utils/enums/http-status';

import type { LoginUserDto } from '../auth/dto/login.dto';
import type { CreateUserDto } from './dto/create-user.dto';

export const getUserByUID = async (uid: string) => {
  try {
    const user = await db.select().from(users).where(eq(users.uid, uid));
    return user[0];
  } catch (error) {
    throw error;
  }
};

export const getUserByLoginData = async (loginData: LoginUserDto) => {
  if (!loginData) {
    throw new CustomError(HttpStatus.BAD_REQUEST);
  }

  // CRITICAL: ранее использовался `or(eq(mail, ...), eq(phone, ...))`. Если в
  // запросе нет phone (или передан null), Drizzle превращает `eq(phone, null)`
  // в `phone IS NULL`, и OR-ветка цепляет ПЕРВОГО пользователя без телефона.
  // Это account-takeover, потому что злоумышленник может прислать чужой mail и
  // пустой phone — и попасть на безтелефонного юзера (часто это админ-seed).
  // Фикс: ветки добавляются только при реально присланных значениях.
  const conditions = [];
  if (loginData.mail) conditions.push(eq(users.mail, loginData.mail));
  if (loginData.phone) conditions.push(eq(users.phone, loginData.phone));
  if (conditions.length === 0) {
    throw new CustomError(HttpStatus.BAD_REQUEST);
  }

  const [user] = await db
    .select()
    .from(users)
    .where(conditions.length === 1 ? conditions[0] : or(...conditions));
  return user;
};

export const createUser = async (createUserDto: CreateUserDto) => {
  const tryUser = await db.select().from(users).where(eq(users.mail, createUserDto.mail));
  if (tryUser.length > 0) {
    throw new CustomError(HttpStatus.CONFLICT);
  }

  if (createUserDto.password) {
    createUserDto.password = await hash(createUserDto.password, 10);
  }

  // CRITICAL: открытый /api/auth/register НЕ должен позволять самоназначить
  // привилегированную роль через body. role игнорируется и принудительно
  // ставится DEVELOPER. Поднять до LEAD/HEAD/ADMIN может только админ через
  // /api/admin/users (когда модуль будет реализован — см. ДОРАБОТКИ 4.3).
  const [user] = await db
    .insert(users)
    .values({ ...createUserDto, role: 'DEVELOPER' })
    .returning();

  return user;
};

export const getUserProfile = async (userUid: string) => {
  try {
    const data = await db
      .select({
        uid: users.uid,
        firstName: users.firstName,
        secondName: users.secondName,
        mail: users.mail,
        phone: users.phone,
        birthDate: users.birthDate,
        role: users.role
      })
      .from(users)
      .where(eq(users.uid, userUid));
    if (!data[0]) {
      throw new CustomError(HttpStatus.NOT_FOUND, 'Пользователь не найден');
    }

    return data[0];
  } catch (error) {
    throw error;
  }
};
