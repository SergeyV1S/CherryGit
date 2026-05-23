import { matchGlob } from '@/modules/sync/glob-match';

/**
 * Резолв «модуль кодовой базы» для пути файла (доработка 2.6, Bus Factor).
 *
 * Два режима:
 *   1) explicit — найти первый `CodeModule`, чей `pathPattern` (glob)
 *      соответствует пути файла. Порядок проверки — как пришло в массиве
 *      (сервис сортирует по `name` для стабильности).
 *   2) implicit — fallback: первая директория пути.
 *      `src/auth/foo.ts` → `auth`
 *      `apps/web/src/index.tsx` → `apps`
 *      `package.json` → `<root>` (файл в корне)
 *
 * Implicit-режим намеренно отрезает только ПЕРВЫЙ сегмент, а не глубже:
 * на типичных монорепозиториях именно верхняя директория соответствует
 * «модулю» (auth, billing, web и т.д.). Если админу нужна более тонкая
 * группировка — он заводит `code_modules.pathPattern` для проекта.
 *
 * Возвращает `{ name, pathPattern, isImplicit }`:
 *   — name              — отображаемое имя модуля;
 *   — pathPattern       — glob (null для implicit);
 *   — isImplicit        — true = это fallback-модуль (UI может пометить «авто»).
 */
export interface ModuleSpec {
  name: string;
  pathPattern: string;
}

export interface ResolvedModule {
  name: string;
  pathPattern: string | null;
  isImplicit: boolean;
}

/**
 * Метка модуля для файлов в корне проекта.
 * Видна в UI как отдельный bucket — обычно туда попадают конфиги
 * (`package.json`, `Dockerfile`), и Bus Factor для них даёт полезный сигнал
 * «один человек правит инфраструктуру».
 */
export const ROOT_MODULE_NAME = '<root>';

export const resolveModule = (
  filePath: string,
  explicit: ReadonlyArray<ModuleSpec>
): ResolvedModule => {
  for (const m of explicit) {
    if (matchGlob(m.pathPattern, filePath)) {
      return { name: m.name, pathPattern: m.pathPattern, isImplicit: false };
    }
  }

  // Fallback — первая директория. Slash считаем разделителем даже на Windows:
  // GitLab всегда отдаёт пути с `/`, независимо от OS клиента.
  const idx = filePath.indexOf('/');
  if (idx === -1 || idx === 0) {
    // Нет `/` (корневой файл) или путь начинается с `/` (некорректный, страховка).
    return { name: ROOT_MODULE_NAME, pathPattern: null, isImplicit: true };
  }
  return { name: filePath.slice(0, idx), pathPattern: null, isImplicit: true };
};
