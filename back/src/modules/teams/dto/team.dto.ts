import { z } from 'zod';

/**
 * Zod-схемы для модуля teams (доработка 4.1).
 *
 * Принципы:
 *   — все uid — UUID;
 *   — `name` непустое, длина 1..255 (PostgreSQL TEXT, но ограничиваем чтобы
 *     не было «Команды для тестирования автоматизации регрессионных тестов
 *     модуля бухгалтерского учёта в проекте ERP-2025-final-FINAL» — UX);
 *   — `description` опциональное, до 1024;
 *   — `role` — `DEVELOPER` | `LEAD` per-team (см. team-member-role.type.ts);
 *   — массивы projectUids дедуплицируются на уровне Zod transform —
 *     иначе unique constraint `uq_team_project` упал бы на 23505.
 */

const NAME = z.string().min(1, 'name is required').max(255);
const DESC = z.string().max(1024).optional();
const UUID = z.string().uuid();

const TEAM_MEMBER_ROLE = z.enum(['DEVELOPER', 'LEAD']);

const PROJECT_UID_LIST = z
  .array(UUID)
  .max(50, 'не более 50 проектов в одном запросе')
  .transform((arr) => [...new Set(arr)]);

export const createTeamSchema = z.object({
  name: NAME,
  description: DESC,
  /** Отдел, к которому относится команда. Nullable: MVP допускает «без отдела». */
  departmentUid: UUID.optional(),
  /** Опциональная привязка проектов при создании. */
  projectUids: PROJECT_UID_LIST.optional()
});

export const updateTeamSchema = z
  .object({
    name: NAME.optional(),
    description: DESC,
    /** null = «отвязать от отдела»; undefined = «не трогать». */
    departmentUid: UUID.nullable().optional()
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'патч не содержит изменений'
  });

export const addTeamMemberSchema = z.object({
  userUid: UUID,
  role: TEAM_MEMBER_ROLE
});

export const updateTeamMemberSchema = z.object({
  role: TEAM_MEMBER_ROLE
});

export const attachProjectSchema = z.object({
  projectUid: UUID
});

export type CreateTeamDto = z.infer<typeof createTeamSchema>;
export type UpdateTeamDto = z.infer<typeof updateTeamSchema>;
export type AddTeamMemberDto = z.infer<typeof addTeamMemberSchema>;
export type UpdateTeamMemberDto = z.infer<typeof updateTeamMemberSchema>;
export type AttachProjectDto = z.infer<typeof attachProjectSchema>;
