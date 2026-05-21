import { notImplemented } from '@/lib/not-implemented';

/**
 * Инкрементальный сбор данных GitLab (BPMN основной процесс, ВКР 3.4).
 * Запускается планировщиком node-cron, может быть инициирован вручную ADMIN.
 *
 * Алгоритм:
 *  1. Чтение sync_statuses для определения «закладки» (lastCommitSha / lastMrIid).
 *  2. GitlabClient.fetchCommits/fetchMergeRequests/fetchTags с пагинацией.
 *  3. Сохранение сырых payload-ов в gitlab_raw_payloads.
 *  4. Парсинг в нормализованные сущности (commits, merge_requests, mr_reviews, deployments).
 *  5. Классификация развёртываний (по releaseTagPattern, hotfix/revert labels).
 *  6. Параллельный запуск калькуляторов метрик (BPMN параллельный шлюз).
 *  7. Обновление sync_statuses, запись в audit_logs.
 */

/** Запустить sync для конкретного проекта (ручной триггер) */
export const syncProject = async (_actorUid: string, _projectUid: string) => {
  notImplemented('sync.syncProject');
};

/** Запустить sync для всех проектов (вызывается из cron) */
export const syncAllProjects = async () => {
  notImplemented('sync.syncAllProjects');
};

export const getSyncStatus = async (_projectUid: string) => {
  notImplemented('sync.getSyncStatus');
};

/** Пересчёт метрик без обращения к GitLab (для повторных вычислений) */
export const recalculateMetrics = async (_actorUid: string, _projectUid: string) => {
  notImplemented('sync.recalculateMetrics');
};
