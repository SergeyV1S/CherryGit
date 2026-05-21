import { CustomError } from '@/utils/custom_error';
import { HttpStatus } from '@/utils/enums/http-status';

/**
 * Заглушка для эндпоинтов и сервисов, логика которых ещё не реализована.
 * Возвращает 501 Not Implemented c пометкой о незавершённой реализации.
 */
export const notImplemented = (label?: string): never => {
  throw new CustomError(HttpStatus.NOT_IMPLEMENTED, label ?? 'endpoint not implemented yet');
};
