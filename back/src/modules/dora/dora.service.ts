import { notImplemented } from '@/lib/not-implemented';

/**
 * Кросс-командные DORA-метрики для руководителя отдела (ВКР 2.2.7, FR-05).
 * Доступ — только HEAD; данные агрегируются по командам внутри отдела пользователя.
 *
 * Принципиально НЕ возвращает индивидуальные данные участников
 * и не позволяет drill-down глубже уровня команды.
 */
export const getCrossTeamDora = async (
  _actorUid: string,
  _periodStart: Date,
  _periodEnd: Date
) => {
  notImplemented('dora.getCrossTeamDora');
};

/**
 * Сравнительная динамика DORA-метрик команд во времени.
 */
export const getCrossTeamTrend = async (
  _actorUid: string,
  _periodStart: Date,
  _periodEnd: Date,
  _granularity: 'day' | 'month' | 'week'
) => {
  notImplemented('dora.getCrossTeamTrend');
};
