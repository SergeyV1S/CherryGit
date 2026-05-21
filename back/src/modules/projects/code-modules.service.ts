import { notImplemented } from '@/lib/not-implemented';

import type { CreateCodeModuleDto } from './dto/connect-project.dto';

/**
 * Разметка модулей кодовой базы для расчёта Bus Factor (ВКР 2.2.2, FR-10).
 * Администратор задаёт логические модули через glob-паттерны путей файлов.
 */
export const listCodeModules = async (_projectUid: string) => {
  notImplemented('codeModules.list');
};

export const createCodeModule = async (
  _projectUid: string,
  _dto: CreateCodeModuleDto
) => {
  notImplemented('codeModules.create');
};

export const updateCodeModule = async (
  _moduleUid: string,
  _dto: Partial<CreateCodeModuleDto>
) => {
  notImplemented('codeModules.update');
};

export const deleteCodeModule = async (_moduleUid: string) => {
  notImplemented('codeModules.delete');
};
