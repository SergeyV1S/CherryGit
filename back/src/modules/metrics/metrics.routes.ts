import { Router } from 'express';

import { isAuthenticated } from '@/middleware/auth.middleware';
import { requireRole } from '@/middleware/role.middleware';

import * as MetricsController from './metrics.controller';

/**
 * Метрики уровня команды.
 * Монтируется поверх /teams/:teamUid (mergeParams для доступа к teamUid).
 *
 * Соответствие матрице доступа ВКР 2.2.7:
 *   /metrics               — DEV (+1) / LEAD (+2) / HEAD (+)
 *   /cycle-time-mr         — LEAD (+2) только
 *   /mr-size               — LEAD (+2) только (парная с cycle-time-mr)
 *   /lead-time             — LEAD (+2) / HEAD (+) — DORA throughput
 *   /deployment-frequency  — LEAD (+2) / HEAD (+) — DORA throughput (парная с CFR)
 *   /change-failure-rate   — LEAD (+2) / HEAD (+) — DORA instability (парная с DF)
 *   /bus-factor            — LEAD (+2) / HEAD (+)
 *   /anomalies             — LEAD (+2) только
 */
const router = Router({ mergeParams: true });

router.use(isAuthenticated);

router.get('/metrics', MetricsController.getTeamMetrics);

router.get(
  '/mr-size',
  requireRole('LEAD', 'ADMIN'),
  MetricsController.getTeamMrSize
);

router.get(
  '/cycle-time-mr',
  requireRole('LEAD', 'ADMIN'),
  MetricsController.getTeamCycleTimeMr
);

router.get(
  '/lead-time',
  requireRole('LEAD', 'HEAD', 'ADMIN'),
  MetricsController.getTeamLeadTime
);

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

router.get(
  '/bus-factor',
  requireRole('LEAD', 'HEAD', 'ADMIN'),
  MetricsController.getTeamBusFactor
);

router.get(
  '/anomalies',
  requireRole('LEAD', 'ADMIN'),
  MetricsController.getTeamAnomalies
);

router.post(
  '/anomalies/:anomalyUid/dismiss',
  requireRole('LEAD', 'ADMIN'),
  MetricsController.dismissAnomaly
);

export default router;
