import { and, asc, eq } from 'drizzle-orm';

import { db } from '@/db/drizzle/connect';
import { codeModules, projects } from '@/db/drizzle/schema/gitlab/schema';
import { recordAuditLog } from '@/modules/audit/audit.service';
import { compileGlob } from '@/modules/sync/glob-match';
import { CustomError } from '@/utils/custom_error';
import { HttpStatus } from '@/utils/enums/http-status';

import type { CreateCodeModuleDto } from './dto/connect-project.dto';

/**
 * CRUD разметки модулей кодовой базы для расчёта Bus Factor
 * (ВКР 2.2.2, FR-10, доработка 2.6).
 *
 * Семантика: админ задаёт логические модули для конкретного проекта через
 * glob-паттерны путей файлов. На этих паттернах `BusFactorCalculator`
 * группирует merged MR'ы и считает distinct-авторов.
 *
 * Уникальность: `name` в рамках проекта — Postgres unique constraint
 * `uq_module_per_project` (см. schema.ts). Нарушение → HTTP 409.
 *
 * Аудит: пишется на каждую мутацию (create/update/delete) — соответствие
 * ВКР 2.2.3.
 */

const PG_UNIQUE_VIOLATION = '23505';

/**
 * Проверить, что проект существует. Бросает 404, если нет.
 * Используется во всех мутациях и list — чтобы 404 предшествовал 409.
 */
const assertProjectExists = async (projectUid: string): Promise<void> => {
  const [row] = await db
    .select({ uid: projects.uid })
    .from(projects)
    .where(eq(projects.uid, projectUid));
  if (!row) {
    throw new CustomError(HttpStatus.NOT_FOUND, 'Project not found');
  }
};

/**
 * Валидация glob-паттерна. Использует `compileGlob`, который бросает на
 * пустых строках и unterminated character classes (`src/[ab`). Это та же
 * функция, что используется sync'ом для releaseTagPattern и Bus Factor'ом
 * при resolveModule — гарантия, что валидный сейчас паттерн будет валиден
 * и во всех потребителях.
 */
const validatePathPattern = (pathPattern: string): void => {
  try {
    compileGlob(pathPattern);
  } catch (error) {
    throw new CustomError(
      HttpStatus.BAD_REQUEST,
      `pathPattern is not a valid glob: ${(error as Error).message}`
    );
  }
};

const isUniqueViolation = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: unknown; cause?: { code?: unknown } };
  return e.code === PG_UNIQUE_VIOLATION || e.cause?.code === PG_UNIQUE_VIOLATION;
};

export const listCodeModules = async (projectUid: string) => {
  await assertProjectExists(projectUid);
  return db
    .select()
    .from(codeModules)
    .where(eq(codeModules.projectUid, projectUid))
    .orderBy(asc(codeModules.name));
};

export const createCodeModule = async (
  projectUid: string,
  dto: CreateCodeModuleDto,
  actorUid?: string
) => {
  await assertProjectExists(projectUid);
  validatePathPattern(dto.pathPattern);

  let created;
  try {
    [created] = await db
      .insert(codeModules)
      .values({
        projectUid,
        name: dto.name,
        pathPattern: dto.pathPattern,
        description: dto.description ?? null
      })
      .returning();
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new CustomError(
        HttpStatus.CONFLICT,
        `code module with name "${dto.name}" already exists in this project`
      );
    }
    throw error;
  }

  await recordAuditLog({
    userUid: actorUid,
    action: 'code_module.created',
    entityType: 'code_module',
    entityId: created.uid,
    details: {
      projectUid,
      name: created.name,
      pathPattern: created.pathPattern
    }
  });

  return created;
};

export const updateCodeModule = async (
  moduleUid: string,
  dto: Partial<CreateCodeModuleDto>,
  actorUid?: string
) => {
  const [existing] = await db
    .select()
    .from(codeModules)
    .where(eq(codeModules.uid, moduleUid));
  if (!existing) {
    throw new CustomError(HttpStatus.NOT_FOUND, 'Code module not found');
  }

  if (dto.pathPattern !== undefined) {
    validatePathPattern(dto.pathPattern);
  }

  const patch: Partial<typeof codeModules.$inferInsert> = {};
  if (dto.name !== undefined) patch.name = dto.name;
  if (dto.pathPattern !== undefined) patch.pathPattern = dto.pathPattern;
  if (dto.description !== undefined) patch.description = dto.description;

  if (Object.keys(patch).length === 0) {
    return existing;
  }

  let updated;
  try {
    [updated] = await db
      .update(codeModules)
      .set(patch)
      .where(eq(codeModules.uid, moduleUid))
      .returning();
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new CustomError(
        HttpStatus.CONFLICT,
        `code module with name "${dto.name}" already exists in this project`
      );
    }
    throw error;
  }

  // Защита от гонки: между SELECT и UPDATE модуль мог быть удалён.
  if (!updated) {
    throw new CustomError(HttpStatus.NOT_FOUND, 'Code module not found');
  }

  await recordAuditLog({
    userUid: actorUid,
    action: 'code_module.updated',
    entityType: 'code_module',
    entityId: moduleUid,
    details: {
      before: {
        name: existing.name,
        pathPattern: existing.pathPattern,
        description: existing.description
      },
      after: {
        name: updated.name,
        pathPattern: updated.pathPattern,
        description: updated.description
      }
    }
  });

  return updated;
};

export const deleteCodeModule = async (moduleUid: string, actorUid?: string) => {
  const result = await db
    .delete(codeModules)
    .where(eq(codeModules.uid, moduleUid))
    .returning({
      uid: codeModules.uid,
      projectUid: codeModules.projectUid,
      name: codeModules.name,
      pathPattern: codeModules.pathPattern
    });
  if (result.length === 0) {
    throw new CustomError(HttpStatus.NOT_FOUND, 'Code module not found');
  }

  await recordAuditLog({
    userUid: actorUid,
    action: 'code_module.deleted',
    entityType: 'code_module',
    entityId: moduleUid,
    details: {
      projectUid: result[0].projectUid,
      name: result[0].name,
      pathPattern: result[0].pathPattern
    }
  });
};

/**
 * Хелпер для метрик: explicit-модули одного проекта.
 * Сейчас не используется напрямую (BusFactor выбирает по `projectUid IN (...)`),
 * но оставлен для будущего snapshot-writer'а (2.7).
 */
export const findModulesByProject = async (projectUid: string) => {
  return db
    .select({
      name: codeModules.name,
      pathPattern: codeModules.pathPattern
    })
    .from(codeModules)
    .where(and(eq(codeModules.projectUid, projectUid)));
};
