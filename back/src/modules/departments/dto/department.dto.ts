import { z } from 'zod';

/**
 * Zod-схемы модуля departments (доработка 4.2).
 *
 * Принципы:
 *   — все uid — UUID;
 *   — `name` непустое, длина 1..255 (PostgreSQL TEXT, ограничение UX);
 *   — `description` опциональное, до 1024 (как в teams.dto);
 *   — отсутствие unique на `departments.name` (схема) — допускаются
 *     одноимённые отделы, отличающиеся `description` (например, два
 *     «Backend» в разных продуктовых линиях). Если потребуется
 *     уникальность — добавить partial unique по `(LOWER(name))`.
 */

const NAME = z.string().min(1, 'name is required').max(255);
const DESC = z.string().max(1024).optional();
const UUID = z.string().uuid();

export const createDepartmentSchema = z.object({
  name: NAME,
  description: DESC
});

export const updateDepartmentSchema = z
  .object({
    name: NAME.optional(),
    description: DESC
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'патч не содержит изменений'
  });

/** POST /departments/:uid/teams — привязать команду к отделу. */
export const attachTeamSchema = z.object({
  teamUid: UUID
});

/**
 * POST /departments/:uid/heads — назначить пользователя руководителем отдела.
 *
 * `setRoleToHead` (default `true`) — одновременно поднять глобальную роль
 * пользователя до HEAD. По концепции CherryGit (CLAUDE.md, ВКР 2.2.7) HEAD —
 * это сама роль, без неё назначение бессмысленно: matrix-middleware всё
 * равно не пустит DEVELOPER к DORA-метрикам отдела. Передать `false`
 * можно только если админ ВРУЧНУЮ уже поднял роль в users-admin и хочет
 * связать с отделом отдельной операцией (audit trail).
 */
export const assignHeadSchema = z.object({
  userUid: UUID,
  setRoleToHead: z.boolean().optional().default(true)
});

export type CreateDepartmentDto = z.infer<typeof createDepartmentSchema>;
export type UpdateDepartmentDto = z.infer<typeof updateDepartmentSchema>;
export type AttachTeamDto = z.infer<typeof attachTeamSchema>;
export type AssignHeadDto = z.infer<typeof assignHeadSchema>;
