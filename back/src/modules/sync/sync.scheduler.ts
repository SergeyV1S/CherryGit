import type { ScheduledTask } from 'node-cron';

import cron from 'node-cron';

import { logger } from '@/lib/loger';

import * as SyncService from './sync.service';

/**
 * Планировщик периодической синхронизации (FR-02, BPMN основной процесс).
 *
 * Реализован на node-cron: расписание задаётся cron-выражением, что позволяет
 * выразить не только «каждые N минут», но и более сложные политики (например,
 * только в рабочие часы — `0 9-18 * * 1-5`). Выражение приходит из config.sync
 * (env `SYNC_CRON`; при его отсутствии собирается `*\/N * * * *` из
 * `SYNC_INTERVAL_M`).
 *
 * Гарантии:
 *  — параллельный запуск syncAllProjects блокируется флагом `isRunning`, чтобы
 *    срабатывания планировщика не перекрывались на медленном GitLab;
 *  — node-cron запускает первый прогон по расписанию, а не сразу при старте,
 *    чтобы дать приложению полностью подняться; немедленный прогон — через
 *    опцию `runOnStart`;
 *  — graceful stop возможен через stopScheduler() (→ `task.destroy()`) —
 *    пригодится для тестов и SIGTERM handler'а (если будет добавлен).
 */

const DEFAULT_CRON_EXPRESSION = '*/10 * * * *'; // каждые 10 минут

let task: ScheduledTask | null = null;
let isRunning = false;

export interface SchedulerOptions {
  /** cron-выражение расписания (5 полей). По умолчанию — каждые 10 минут. */
  cronExpression?: string;
  /** Запустить ли первый цикл сразу, не дожидаясь расписания. */
  runOnStart?: boolean;
}

export const startScheduler = (opts: SchedulerOptions = {}): void => {
  if (task) {
    logger.warn('sync.scheduler: уже запущен, повторный startScheduler проигнорирован');
    return;
  }

  let cronExpression = opts.cronExpression ?? DEFAULT_CRON_EXPRESSION;
  if (!cron.validate(cronExpression)) {
    logger.warn(
      `sync.scheduler: некорректное cron-выражение "${cronExpression}", откат к "${DEFAULT_CRON_EXPRESSION}"`
    );
    cronExpression = DEFAULT_CRON_EXPRESSION;
  }

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

  // node-cron сам стартует задачу; первый прогон произойдёт по расписанию.
  task = cron.schedule(
    cronExpression,
    () => {
      void tick();
    },
    { name: 'gitlab-sync' }
  );

  logger.info(`sync.scheduler: started with cron="${cronExpression}"`);

  if (opts.runOnStart) {
    void tick();
  }
};

export const stopScheduler = (): void => {
  if (task) {
    task.destroy();
    task = null;
    logger.info('sync.scheduler: stopped');
  }
};

/** Тестовый хелпер: запущен ли планировщик. */
export const isSchedulerActive = (): boolean => task !== null;
