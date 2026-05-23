import { stringify } from 'csv-stringify/sync';

/**
 * CSV-генератор для модуля export (доработка 6).
 *
 * Опции отражают ВКР FR-12 «экспорт результатов в CSV» с учётом UX-нюансов
 * русскоязычного дашборда:
 *
 *   1. **UTF-8 BOM** (`﻿`) в начале файла — без него Excel-RU открывает
 *      кириллицу как `Ð°Ð±Ð²Ð³...` (cp1251-режим). С BOM Excel
 *      автоматически переключается на UTF-8.
 *
 *   2. **Разделитель — `;`** (по умолчанию). Microsoft Excel в локалях
 *      с десятичной запятой (RU/DE/FR) разбирает CSV с `;` без диалога
 *      «Импорт». Стандарт RFC 4180 рекомендует `,`, но в реальных
 *      корпоративных средах с Excel-RU `;` даёт лучший UX. Параметр
 *      `separator` оставляем настраиваемым, чтобы при необходимости
 *      админ мог переключить на `,` (через URL `?separator=,`).
 *
 *   3. **Quote-escape**: `csv-stringify` сам экранирует `;` `"` `\n` в
 *      значениях, оборачивая в `"..."` и удваивая внутренние `"`.
 *      Это критично для `details` JSON-полей audit-логов и multiline
 *      описаний в commit messages.
 *
 *   4. **`null` / `undefined` → пустая строка** — стандарт для CSV;
 *      Excel показывает как пустую ячейку. JSONB-значения сериализуются
 *      в JSON-строку (`JSON.stringify`), даты — в ISO-8601.
 *
 * Возвращает `Buffer` готовый к `res.send()` — длина и кодировка
 * корректны (`Content-Length` в Express ставится автоматически).
 */

/** UTF-8 BOM — без него Excel-RU неправильно открывает кириллицу. */
const UTF8_BOM = '﻿';

export interface CsvWriteOptions<T> {
  /**
   * Колонки в порядке вывода. `key` — поле в row (можно nested через function);
   * `header` — заголовок (русскоязычный).
   */
  columns: Array<{
    header: string;
    key: keyof T | ((row: T) => unknown);
  }>;
  rows: T[];
  /** Разделитель: `;` (default — для Excel-RU) или `,` (RFC 4180). */
  separator?: ',' | ';';
}

/**
 * Сериализация одного значения в CSV-ячейку.
 *   — Date → ISO-8601 (`2026-05-23T10:00:00.000Z`);
 *   — null/undefined → пустая строка;
 *   — object/array → JSON.stringify (для details audit-логов и т.п.);
 *   — number → дефолтный toString (точка как десятичный, английская локаль);
 *     это намеренно: импорт в Excel-RU всё равно сконвертит при необходимости,
 *     а строковое представление с запятой ломает CSV-парсеры в других системах.
 */
const cellValue = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') return JSON.stringify(v);
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return String(v);
};

export const writeCsv = <T>(options: CsvWriteOptions<T>): Buffer => {
  const separator = options.separator ?? ';';

  const headerRow = options.columns.map((c) => c.header);
  const dataRows = options.rows.map((row) =>
    options.columns.map((c) =>
      cellValue(typeof c.key === 'function' ? c.key(row) : (row as Record<string, unknown>)[c.key as string])
    )
  );

  const body = stringify([headerRow, ...dataRows], {
    delimiter: separator,
    quoted_string: true, // строки в кавычках — стабильно для импорта
    record_delimiter: '\r\n' // CRLF — стандарт CSV (Excel предпочитает)
  });

  return Buffer.from(UTF8_BOM + body, 'utf-8');
};

/**
 * Формирование имени файла с timestamp'ом — для `Content-Disposition`.
 * Шаблон: `<prefix>-<isoUtc>.csv`, ISO без `:` (Windows запрещает `:` в именах).
 *
 * Пример: `team-metrics-2026-05-23T10-30-00.csv`.
 */
export const csvFilename = (prefix: string): string => {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `${prefix}-${ts}.csv`;
};
