import { boolean, date, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import type { RoleType } from './types/role.type';

import { baseSchema } from '../base.schema';
import { departments } from '../departments/schema';

export const users = pgTable(
  'users',
  {
    ...baseSchema,
    firstName: text('first_name').notNull(),
    secondName: text('second_name').notNull(),
    mail: text('email').notNull().unique(),
    password: text('password'),
    phone: text('phone'),
    role: text('role').$type<RoleType>().default('DEVELOPER').notNull(),
    /** Отдел разработки, к которому относится пользователь (для роли HEAD) */
    departmentUid: uuid('department_uid').references(() => departments.uid),
    birthDate: date('birth_date'),
    /**
     * Момент, в который admin подключил GitLab-проект и система сгенерировала
     * этот аккаунт из gitlab_users. null = аккаунт не активирован, login
     * запрещён (см. auth.service.validateUser → 403 PROVISION_PENDING).
     * Поле проставляется provisioningService.provisionGitlabUser автоматически
     * после успешного `connectProject`. Для роли ADMIN — устанавливается
     * вручную при seed первого админа.
     */
    provisionedAt: timestamp('provisioned_at'),
    /**
     * true = у пользователя сейчас стоит временный пароль, сгенерированный
     * системой при provisioning. Используется UI чтобы показать «измените
     * пароль» баннер. Сбрасывается, когда пользователь сменит пароль через
     * /api/me/password (флоу будет добавлен отдельно во фронте).
     */
    isTempPassword: boolean('is_temp_password').default(false).notNull()
  },
  (table) => ({
    usersMailUnique: unique('users_mail_unique').on(table.mail),
    usersPhoneUnique: unique('users_phone_unique').on(table.phone)
  })
);

export type InsertUser = typeof users.$inferInsert;
export type SelectUser = typeof users.$inferSelect;

export const userProfle = pgTable('user_profle', {
  ...baseSchema,
  userUid: uuid('user_uid').references(() => users.uid)
});
