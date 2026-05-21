import { notImplemented } from '@/lib/not-implemented';

import type {
  CreateGitlabConnectionDto,
  UpdateGitlabConnectionDto
} from './dto/create-connection.dto';

/** Список подключений к GitLab. */
export const listConnections = async (_ownerUid: string) => {
  notImplemented('gitlab.listConnections');
};

/**
 * Создать новое подключение к GitLab.
 * Проверяет валидность токена через GitlabClient.ping, шифрует токен (ВКР 2.2.3).
 */
export const createConnection = async (
  _ownerUid: string,
  _dto: CreateGitlabConnectionDto
) => {
  notImplemented('gitlab.createConnection');
};

export const updateConnection = async (
  _uid: string,
  _dto: UpdateGitlabConnectionDto
) => {
  notImplemented('gitlab.updateConnection');
};

export const deleteConnection = async (_uid: string) => {
  notImplemented('gitlab.deleteConnection');
};

/**
 * Получить список доступных проектов с GitLab-инстанса
 * (используется в UC-01 при подключении проекта).
 */
export const fetchAvailableProjects = async (_connectionUid: string) => {
  notImplemented('gitlab.fetchAvailableProjects');
};
