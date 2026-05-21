/**
 * Тип сырого payload, полученного от GitLab API.
 * Используется в staging-таблице gitlab_raw_payloads (ВКР 2.2.5)
 * для буферизации до парсинга в нормализованные сущности.
 */
export type RawPayloadType =
  | 'commit'
  | 'deployment'
  | 'merge_request'
  | 'project'
  | 'review'
  | 'tag';
