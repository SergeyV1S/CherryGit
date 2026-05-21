import { notImplemented } from '@/lib/not-implemented';

/**
 * Профиль текущего пользователя с расширенными данными
 * (роль, отдел, GitLab-идентичности, состав команд).
 */
export const getCurrentUser = async (_userUid: string) => {
  notImplemented('me.getCurrentUser');
};

/**
 * Индивидуальные метрики текущего пользователя за период.
 * Доступ — только сам пользователь (ВКР 2.1.5, UC-03).
 *
 * Возвращает: Cycle Time MR + MR Size для данного пользователя
 * + командный baseline для сопоставления.
 */
export const getMyMetrics = async (_userUid: string, _periodStart: Date, _periodEnd: Date) => {
  notImplemented('me.getMyMetrics');
};

/**
 * История индивидуальных показателей за весь период наблюдения (ВКР FR-14).
 */
export const getMyMetricsHistory = async (_userUid: string) => {
  notImplemented('me.getMyMetricsHistory');
};

/**
 * Список сопоставлений учётной записи с GitLab-аккаунтами.
 */
export const getMyGitlabIdentities = async (_userUid: string) => {
  notImplemented('me.getMyGitlabIdentities');
};
