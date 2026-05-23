import { Router } from 'express';

import { isAuthenticated } from '@/middleware/auth.middleware';
import { requireRole } from '@/middleware/role.middleware';

import * as MetricsController from './metrics.controller';

/**
 * Метрики уровня команды.
 * Монтируется поверх /teams/:teamUid (mergeParams для доступа к teamUid).
 *
 * Матрица доступа (ВКР 2.2.7, синхрон с `middleware/role-matrix.ts:TEAM_METRIC_ACCESS`):
 *   /metrics               — DEV-член / LEAD / HEAD (агрегаты команды)
 *   /cycle-time-mr         — LEAD только         (review-метрика)
 *   /mr-size               — LEAD только         (review-метрика, парная с CT MR)
 *   /lead-time             — LEAD / HEAD         (DORA throughput)
 *   /deployment-frequency  — LEAD / HEAD         (DORA throughput, парная с CFR)
 *   /change-failure-rate   — LEAD / HEAD         (DORA instability, парная с DF)
 *   /bus-factor            — LEAD / HEAD         (FR-10)
 *   /anomalies             — LEAD только         (сигналы аномалий FR-13)
 *
 * Защита (доработка 3.1, двухступенчатая):
 *   1. `requireRole(...)` — глобальный role-фильтр на маршруте;
 *   2. `assertTeamAccess` внутри сервиса — per-team scope:
 *      ADMIN везде / LEAD = лид этой команды / HEAD = голова отдела
 *      этой команды / DEVELOPER = член этой команды (для baseline FR-07).
 *
 * `requireTeamAccess` middleware НЕ повешен здесь намеренно — сервисы
 * `getTeam*` сами вызывают `assertTeamAccess` (см. `compute-team.ts`),
 * двойной check был бы дублированием 4-x SQL-запросов на ровном месте.
 * Это допустимо: сервис — единственный путь к данным, secure by design.
 */
const router = Router({ mergeParams: true });

router.use(isAuthenticated);

router.get('/metrics', MetricsController.getTeamMetrics);

router.get('/mr-size', requireRole('LEAD', 'ADMIN'), MetricsController.getTeamMrSize);

router.get('/cycle-time-mr', requireRole('LEAD', 'ADMIN'), MetricsController.getTeamCycleTimeMr);

router.get('/lead-time', requireRole('LEAD', 'HEAD', 'ADMIN'), MetricsController.getTeamLeadTime);

router.get(
  '/deployment-frequency',
  requireRole('LEAD', 'HEAD', 'ADMIN'),
  MetricsController.getTeamDeploymentFrequency
);

router.get(
  '/change-failure-rate',
  requireRole('LEAD', 'HEAD', 'ADMIN'),
  MetricsController.getTeamChangeFailureRate
);

router.get('/bus-factor', requireRole('LEAD', 'HEAD', 'ADMIN'), MetricsController.getTeamBusFactor);

router.get('/anomalies', requireRole('LEAD', 'ADMIN'), MetricsController.getTeamAnomalies);

router.post(
  '/anomalies/:anomalyUid/dismiss',
  requireRole('LEAD', 'ADMIN'),
  MetricsController.dismissAnomaly
);

export default router;
