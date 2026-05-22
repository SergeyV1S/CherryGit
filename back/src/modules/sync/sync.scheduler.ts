import { logger } from '@/lib/loger';

import * as SyncService from './sync.service';

/**
 * Планировщик периодической синхронизации (FR-02, BPMN основной процесс).
 *
 * Реализация на setInterval — для MVP. Когда понадобится cron-выражение
 * (например, «только в рабочее время»), достаточно заменить вызов
 * setInterval на node-cron, не меняя сигнатуры startScheduler/stopScheduler.
 *
 * Гарантии:
 *  — параллельный запуск syncAllProjects блокируется флагом `isRunning`,
 *    чтобы tick'и не перекрывались на медленном GitLab;
 *  — первый tick запускается через `intervalMs`, а не немедленно, чтобы
 *    дать приложению полностью подняться;
 *  — graceful stop возможен через stopScheduler() — пригодится для тестов
 *    и SIGTERM handler'а (если будет добавлен).
 */

const DEFAULT_INTERVAL_MS = 10 * 60 * 1000; // 10 минут

let timer: NodeJS.Timeout | null = null;
let isRunning = false;

export interface SchedulerOptions {
  /** Интервал между запусками в миллисекундах. По умолчанию 10 минут. */
  intervalMs?: number;
  /** Запустить ли первый цикл сразу, не дожидаясь интервала. */
  runOnStart?: boolean;
}

export const startScheduler = (opts: SchedulerOptions = {}): void => {
  if (timer) {
    logger.warn('sync.scheduler: уже запущен, повторный startScheduler проигнорирован');
    return;
  }

  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;

  const tick = async (): Promise<void> => {
    if (isRunning) {
      logger.warn('sync.scheduler: предыдущий tick ещё не завершён, пропускаем');
      return;
    }
    isRunning = true;
    try {
      const report = await SyncService.syncAllProjects();
      logger.info(
        `sync.scheduler: tick complete — total=${report.total} ok=${report.ok} failed=${report.failed}`
      );
    } catch (err) {
      logger.error(`sync.scheduler: tick failed: ${(err as Error).message}`);
    } finally {
      isRunning = false;
    }
  };

  timer = setInterval(() => {
    void tick();
  }, intervalMs);

  logger.info(`sync.scheduler: started with intervalMs=${intervalMs}`);

  if (opts.runOnStart) {
    void tick();
  }
};

export const stopScheduler = (): void => {
  if (timer) {
    clearInterval(timer);
    timer = null;
    logger.info('sync.scheduler: stopped');
  }
};

/** Тестовый хелпер: запущен ли планировщик. */
export const isSchedulerActive = (): boolean => timer !== null;
