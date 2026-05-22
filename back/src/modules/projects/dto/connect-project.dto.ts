import { z } from 'zod';

/**
 * Zod-схемы для модуля projects (валидация на границе REST API).
 *
 * Решения:
 *  — gitlabProjectId — положительное целое, в GitLab ID начинается с 1;
 *  — releaseTagPattern — glob, длина и набор символов не валидируются жёстко,
 *    т.к. реальные паттерны могут содержать `[`, `*`, `?`, `/`;
 *  — teamUids — массив UUID, может быть пустым (проект без команд = технический,
 *    участвует только в admin-метриках).
 */

const LABEL = z.string().min(1).max(255);

export const connectProjectSchema = z.object({
  gitlabConnectionUid: z.string().uuid(),
  gitlabProjectId: z.number().int().positive(),
  teamUids: z.array(z.string().uuid()).optional(),
  releaseTagPattern: z.string().min(1).max(255).optional(),
  hotfixLabel: LABEL.optional(),
  revertLabel: LABEL.optional()
});

export const updateProjectSchema = z
  .object({
    releaseTagPattern: z.string().min(1).max(255).optional(),
    hotfixLabel: LABEL.optional(),
    revertLabel: LABEL.optional(),
    /** Полная замена набора привязанных команд. undefined — не трогать связи. */
    teamUids: z.array(z.string().uuid()).optional()
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'патч не содержит изменений'
  });

export const createCodeModuleSchema = z.object({
  name: z.string().min(1).max(255),
  pathPattern: z.string().min(1).max(512),
  description: z.string().max(1024).optional()
});

export type ConnectProjectDto = z.infer<typeof connectProjectSchema>;
export type UpdateProjectDto = z.infer<typeof updateProjectSchema>;
export type CreateCodeModuleDto = z.infer<typeof createCodeModuleSchema>;
