import { z } from 'zod';

/**
 * Zod-схемы для модуля projects (валидация на границе REST API).
 *
 * Решения:
 *  — gitlabProjectId — положительное целое, в GitLab ID начинается с 1;
 *  — releaseTagPattern — glob, длина и набор символов не валидируются жёстко,
 *    т.к. реальные паттерны могут содержать `[`, `*`, `?`, `/`;
 *  — teamUids — массив UUID, может быть пустым (проект без команд = технический,
 *    участвует только в admin-метриках);
 *  — hotfixLabels / revertLabels — массивы строк (FR-03, ВКР 2.5);
 *    1..20 элементов; пустой массив запрещён, чтобы не отключать классификацию
 *    случайно — для отключения админ удаляет/архивирует проект.
 */

const LABEL = z.string().min(1).max(255);

/**
 * Набор меток MR. После дедупликации хранится в `projects.hotfixLabels`
 * (Postgres text[]). Кейс-сенситив — GitLab labels case-sensitive.
 */
const LABEL_SET = z
  .array(LABEL)
  .min(1, 'хотя бы одна метка')
  .max(20, 'не более 20 меток')
  .transform((labels) => [...new Set(labels)]);

/**
 * Подключение проекта из пула discovery.
 *
 * Принимает UID записи `gitlab_available_projects` (то есть проект уже
 * увиденный и закэшированный admin'ом через discovery). Сервис сам резолвит
 * `gitlabConnectionUid` и `gitlabProjectId` — это исключает «угадывание»
 * проекта с GitLab-инстансов, к которым у админа нет токена.
 */
export const connectProjectSchema = z.object({
  availableProjectUid: z.string().uuid(),
  releaseTagPattern: z.string().min(1).max(255).optional(),
  hotfixLabels: LABEL_SET.optional(),
  revertLabels: LABEL_SET.optional()
});

export const updateProjectSchema = z
  .object({
    releaseTagPattern: z.string().min(1).max(255).optional(),
    hotfixLabels: LABEL_SET.optional(),
    revertLabels: LABEL_SET.optional(),
    /** Полная замена набора привязанных команд. undefined — не трогать связи. */
    teamUids: z.array(z.string().uuid()).optional()
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'патч не содержит изменений'
  });

/**
 * DTO для отдельного endpoint'а `PATCH /admin/projects/:uid/hotfix-labels`
 * (доработка 1.4). Удобство: можно править классификацию инцидентов
 * без массового PATCH /projects/:uid. Поддерживает оба набора атомарно
 * (хотфиксы и откаты — пара признаков для CFR), но хотя бы один должен
 * присутствовать в теле запроса.
 */
export const updateIncidentLabelsSchema = z
  .object({
    hotfixLabels: LABEL_SET.optional(),
    revertLabels: LABEL_SET.optional()
  })
  .refine((v) => v.hotfixLabels !== undefined || v.revertLabels !== undefined, {
    message: 'передайте hotfixLabels и/или revertLabels'
  });

export const createCodeModuleSchema = z.object({
  name: z.string().min(1).max(255),
  pathPattern: z.string().min(1).max(512),
  description: z.string().max(1024).optional()
});

export type ConnectProjectDto = z.infer<typeof connectProjectSchema>;
export type UpdateProjectDto = z.infer<typeof updateProjectSchema>;
export type UpdateIncidentLabelsDto = z.infer<typeof updateIncidentLabelsSchema>;
export type CreateCodeModuleDto = z.infer<typeof createCodeModuleSchema>;
