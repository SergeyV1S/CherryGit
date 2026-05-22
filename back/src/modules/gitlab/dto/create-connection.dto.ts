import { z } from 'zod';

/**
 * Zod-схемы для запросов модуля GitLab (валидация на границе REST API).
 *
 * Решения:
 *  — baseUrl обязан быть https (ВКР 2.2.3: «защита каналов взаимодействия TLS»);
 *  — token минимум 20 символов: эмпирически короче PAT не выдаёт ни один
 *    мейнстрим-инстанс GitLab; защита от случайной отправки пустой/мусорной строки.
 */

const HTTPS_URL = z
  .string()
  .url('baseUrl должен быть валидным URL')
  .refine((u) => u.startsWith('https://'), {
    message: 'baseUrl должен использовать HTTPS (TLS обязателен)'
  });

const PAT_TOKEN = z
  .string()
  .min(20, 'token слишком короткий для GitLab PAT')
  .max(512, 'token слишком длинный');

export const createGitlabConnectionSchema = z.object({
  name: z.string().min(1).max(255),
  baseUrl: HTTPS_URL,
  token: PAT_TOKEN
});

export const updateGitlabConnectionSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  baseUrl: HTTPS_URL.optional(),
  token: PAT_TOKEN.optional()
});

export type CreateGitlabConnectionDto = z.infer<typeof createGitlabConnectionSchema>;
export type UpdateGitlabConnectionDto = z.infer<typeof updateGitlabConnectionSchema>;
