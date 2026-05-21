/**
 * Параметры периода для запроса метрик.
 * По умолчанию (UC-02 шаг 3а): последние 30 календарных дней.
 */
export class PeriodQueryDto {
  periodStart?: string; // ISO date
  periodEnd?: string; // ISO date
}
