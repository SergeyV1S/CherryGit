import { z } from 'zod';

/**
 * Zod-схемы модуля users-admin (доработка 4.3).
 *
 * Принципы:
 *   — все uid — UUID;
 *   — `mail` валидируется как email; `phone` — опциональная строка;
 *   — `password` минимум 8 символов (DBA-baseline), без жёстких политик
 *     сложности — это MVP-демо, а не enterprise (LDAP / SSO — вне scope);
 *   — `role` ограничивается перечислением; смена роли — ОТДЕЛЬНЫЙ endpoint
 *     (audit + invalidation refresh-токенов), не через `updateUser`;
 *   — изменение пароля — тоже отдельный endpoint (audit + invalidation),
 *     не через `updateUser`.
 *
 * Архитектурное разделение «обычный patch vs role/password» нужно, чтобы:
 *   1. UI-форма редактирования юзера не могла случайно изменить role
 *      одной кнопкой «сохранить»;
 *   2. audit-trail чётко отделял управление профилем от управления
 *      привилегиями (для ВКР 2.2.3 это критично).
 */

const NAME = z.string().min(1, 'не может быть пустым').max(255);
const MAIL = z.string().email('некорректный email').max(255);
const PHONE = z.string().max(32).nullable().optional();
const PASSWORD = z
  .string()
  .min(8, 'пароль не короче 8 символов')
  .max(128, 'пароль не длиннее 128 символов');
const UUID = z.string().uuid();
const ROLE = z.enum(['ADMIN', 'DEVELOPER', 'HEAD', 'LEAD']);
const BIRTH_DATE = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'ожидается формат YYYY-MM-DD')
  .nullable()
  .optional();

/**
 * POST /admin/users — создание пользователя админом.
 *
 * `role` опциональная: если не передана — DEVELOPER (безопасный default).
 * `password` опциональная: если не передана — сервис генерирует
 * криптостойкую временную (возвращается в ответе ОДИН РАЗ — для копирования
 * админу, который передаст её юзеру out-of-band). См. service.createUser.
 */
export const adminCreateUserSchema = z.object({
  firstName: NAME,
  secondName: NAME,
  mail: MAIL,
  phone: PHONE,
  password: PASSWORD.optional(),
  role: ROLE.optional(),
  /** Привязка к отделу. Для HEAD — обязательна по смыслу, но валидируется в сервисе. */
  departmentUid: UUID.nullable().optional(),
  /** ISO YYYY-MM-DD; null допустим. */
  birthDate: BIRTH_DATE
});

/**
 * PATCH /admin/users/:uid — патч профиля. НЕ позволяет менять role/password —
 * для этого отдельные endpoints. Это design choice: смена привилегий — особое
 * событие, должна быть явной мутацией с дополнительной защитой и audit'ом.
 */
export const adminUpdateUserSchema = z
  .object({
    firstName: NAME.optional(),
    secondName: NAME.optional(),
    mail: MAIL.optional(),
    phone: PHONE,
    /** null = «отвязать от отдела»; undefined = «не трогать». */
    departmentUid: UUID.nullable().optional(),
    birthDate: BIRTH_DATE
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'патч не содержит изменений'
  });

/**
 * POST /admin/users/:uid/role — смена глобальной роли.
 *
 * Поведение в сервисе:
 *   — meta-проверка «нельзя понизить себя» (защита от case'а «админ случайно
 *     убрал у себя ADMIN», что приведёт к локауту до прямого SQL'я);
 *   — meta-проверка «нельзя оставить систему без ADMIN'а» (count(ADMIN)=1
 *     + targetUid=lastAdmin + newRole !== ADMIN → 409);
 *   — invalidation всех refresh-токенов целевого юзера (force re-login —
 *     иначе старый JWT с прежней ролью валиден до 15 мин).
 */
export const changeRoleSchema = z.object({
  role: ROLE
});

/**
 * POST /admin/users/:uid/password — сброс пароля админом.
 *
 * Сценарий: юзер забыл пароль → админ задаёт новый, сообщает out-of-band,
 * юзер залогинивается и (опционально, вне scope MVP) меняет на свой через
 * /me/password.
 *
 * Поведение в сервисе:
 *   — bcrypt(rounds=10) — как в auth.service;
 *   — invalidation всех refresh-токенов (все старые сессии разлогиниваются);
 *   — audit `user.password_reset` БЕЗ значения пароля (никогда не пишем
 *     plaintext password в журнал).
 */
export const resetPasswordSchema = z.object({
  password: PASSWORD
});

/**
 * POST /admin/users/:uid/gitlab-identities — связать с GitLab-аккаунтом.
 *
 * `gitlabUserId` опционален: если не передан, сервис разрешит через
 * `GitlabClient.fetchUserByUsername` (использует расшифрованный PAT
 * connection'а). Это удобно для admin UI — достаточно ввести username.
 *
 * Если передан — используется как есть (override; для случая, когда username
 * на GitLab был переименован и нужно зафиксировать ID).
 */
export const linkGitlabIdentitySchema = z.object({
  gitlabConnectionUid: UUID,
  gitlabUsername: z.string().min(1, 'gitlabUsername обязателен').max(255),
  gitlabUserId: z.number().int().positive().optional()
});

export type AdminCreateUserDto = z.infer<typeof adminCreateUserSchema>;
export type AdminUpdateUserDto = z.infer<typeof adminUpdateUserSchema>;
export type ChangeRoleDto = z.infer<typeof changeRoleSchema>;
export type ResetPasswordDto = z.infer<typeof resetPasswordSchema>;
export type LinkGitlabIdentityDto = z.infer<typeof linkGitlabIdentitySchema>;
