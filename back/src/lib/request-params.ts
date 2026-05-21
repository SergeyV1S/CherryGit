import type { Request } from 'express';

/**
 * Безопасное извлечение строкового path-параметра.
 * Express 5 типизирует req.params как `string | string[]`, поэтому
 * для бизнес-кода удобнее иметь хелпер, нормализующий значение.
 */
export const param = (req: Request, name: string): string => {
  const value = req.params[name];
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
};

/** Безопасное извлечение query-параметра как строки. */
export const queryString = (req: Request, name: string): string | undefined => {
  const value = req.query[name];
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : undefined;
  return typeof value === 'string' ? value : undefined;
};
