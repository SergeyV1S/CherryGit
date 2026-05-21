/**
 * Тип сигнала аномалии командного флоу (ВКР FR-13).
 * Хранится без раскрытия конкретных индивидуальных значений участников —
 * только факт устойчивого отклонения.
 */
export type AnomalySignalType =
  | 'bus_factor_drop'
  | 'cycle_time_outlier'
  | 'deployment_frequency_drop'
  | 'mr_size_spike'
  | 'review_load_imbalance'
  | 'time_in_review_spike';
