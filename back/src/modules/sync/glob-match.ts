/**
 * Минималистичный glob-матчер для имён git-тегов (FR-03, ВКР раздел 3.5.2).
 *
 * Поддержка:
 *  — `*`   — любая последовательность символов кроме `/`;
 *  — `**`  — любая последовательность включая `/` (нужно для namespaced тегов);
 *  — `?`   — один любой символ;
 *  — `[...]` — класс символов (`[0-9]`, `[a-z]`), стандартный regex-синтаксис внутри;
 *  — все остальные символы — литералы (включая `.`, экранируются).
 *
 * Намеренно НЕ поддержано: `{a,b}` группы, `!` отрицание, расширенный синтаксис
 * minimatch. Для MVP реальных паттернов тегов (`v*`, `release-*`, `v[0-9]*.*`)
 * этого хватает. Полную поддержку можно подключить установкой `minimatch`.
 */

/** Скомпилировать glob в RegExp. Бросает ошибку при невалидном выражении. */
export const compileGlob = (pattern: string): RegExp => {
  if (!pattern) {
    throw new Error('glob pattern is empty');
  }

  let regex = '^';
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];

    if (ch === '*') {
      // `**` → `.*`, `*` → `[^/]*`
      if (pattern[i + 1] === '*') {
        regex += '.*';
        i += 2;
      } else {
        regex += '[^/]*';
        i += 1;
      }
      continue;
    }

    if (ch === '?') {
      regex += '.';
      i += 1;
      continue;
    }

    if (ch === '[') {
      const end = pattern.indexOf(']', i);
      if (end === -1) throw new Error(`unterminated character class in glob: ${pattern}`);
      regex += pattern.slice(i, end + 1);
      i = end + 1;
      continue;
    }

    // Литерал, экранируем regex-метасимволы
    if (/[.+^$()|\\]/.test(ch)) {
      regex += `\\${ch}`;
    } else {
      regex += ch;
    }
    i += 1;
  }
  regex += '$';

  return new RegExp(regex);
};

/** Проверить, подходит ли строка под glob-паттерн. */
export const matchGlob = (pattern: string, value: string): boolean => {
  try {
    return compileGlob(pattern).test(value);
  } catch {
    return false;
  }
};
