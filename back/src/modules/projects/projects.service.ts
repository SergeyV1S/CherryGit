import { notImplemented } from '@/lib/not-implemented';

import type { ConnectProjectDto, UpdateProjectDto } from './dto/connect-project.dto';

export const listProjects = async () => {
  notImplemented('projects.listProjects');
};

export const getProject = async (_uid: string) => {
  notImplemented('projects.getProject');
};

/**
 * Подключение проекта GitLab к системе (UC-01).
 * Шаги: валидация PAT, сохранение конфигурации, регистрация sync-задачи,
 * первый запуск синхронизации, запись в audit_logs.
 */
export const connectProject = async (_actorUid: string, _dto: ConnectProjectDto) => {
  notImplemented('projects.connectProject');
};

export const updateProject = async (_uid: string, _dto: UpdateProjectDto) => {
  notImplemented('projects.updateProject');
};

export const deleteProject = async (_actorUid: string, _uid: string) => {
  notImplemented('projects.deleteProject');
};
