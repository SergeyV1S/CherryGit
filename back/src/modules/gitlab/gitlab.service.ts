import { eq } from 'drizzle-orm';

import { db } from '@/db/drizzle/connect';
import { gitlabConnections } from '@/db/drizzle/schema/gitlab/schema';
import { decryptSecret, encryptSecret } from '@/lib/encryption';
import { logger } from '@/lib/loger';
import { recordAuditLog } from '@/modules/audit/audit.service';
import { CustomError } from '@/utils/custom_error';
import { HttpStatus } from '@/utils/enums/http-status';

import type {
  CreateGitlabConnectionDto,
  UpdateGitlabConnectionDto
} from './dto/create-connection.dto';

import { GitlabClient } from './gitlab-client.service';

/** Поля подключения, которые можно отдавать наружу (БЕЗ encryptedToken). */
const publicSelection = {
  uid: gitlabConnections.uid,
  ownerUid: gitlabConnections.ownerUid,
  name: gitlabConnections.name,
  baseUrl: gitlabConnections.baseUrl,
  status: gitlabConnections.status,
  lastCheckedAt: gitlabConnections.lastCheckedAt,
  createdAt: gitlabConnections.createdAt,
  updatedAt: gitlabConnections.updatedAt
} as const;

/**
 * Список подключений.
 * Все эндпоинты модуля защищены requireRole('ADMIN'), поэтому фильтр по
 * ownerUid опционален: без него возвращаются все подключения системы.
 */
export const listConnections = async (ownerUid?: string) => {
  const query = db.select(publicSelection).from(gitlabConnections);
  return ownerUid ? query.where(eq(gitlabConnections.ownerUid, ownerUid)) : query;
};

/**
 * Создать подключение GitLab (UC-01 шаги 5, 8, 10).
 *  1. Проверить токен через GET /user (если 401 — отказ).
 *  2. Зашифровать токен (AES-256-GCM) и сохранить в БД.
 *  3. Записать событие в журнал аудита.
 */
export const createConnection = async (
  ownerUid: string,
  dto: CreateGitlabConnectionDto
) => {
  const normalizedBaseUrl = dto.baseUrl.replace(/\/+$/, '');
  const client = new GitlabClient(normalizedBaseUrl, dto.token);

  try {
    const me = await client.ping();
    logger.info(
      `GitLab connection check OK: baseUrl=${normalizedBaseUrl} as ${me.username} (id=${me.id})`
    );
  } catch (error) {
    if (error instanceof CustomError) throw error;
    throw new CustomError(
      HttpStatus.BAD_GATEWAY,
      `Не удалось подключиться к GitLab: ${(error as Error).message}`
    );
  }

  const [created] = await db
    .insert(gitlabConnections)
    .values({
      ownerUid,
      name: dto.name,
      baseUrl: normalizedBaseUrl,
      encryptedToken: encryptSecret(dto.token),
      status: 'active',
      lastCheckedAt: new Date()
    })
    .returning(publicSelection);

  await recordAuditLog({
    userUid: ownerUid,
    action: 'gitlab.connection.created',
    entityType: 'gitlab_connection',
    entityId: created.uid,
    details: { name: created.name, baseUrl: created.baseUrl }
  });

  return created;
};

/**
 * Обновить подключение. Если меняется токен или baseUrl — повторно проверяет
 * ping и (для токена) перешифровывает. Эффективный baseUrl/token берётся
 * из патча, если задан, иначе из текущей записи.
 */
export const updateConnection = async (
  uid: string,
  dto: UpdateGitlabConnectionDto,
  actorUid?: string
) => {
  const [existing] = await db
    .select()
    .from(gitlabConnections)
    .where(eq(gitlabConnections.uid, uid));
  if (!existing) {
    throw new CustomError(HttpStatus.NOT_FOUND, 'GitLab connection not found');
  }

  const patch: Partial<typeof gitlabConnections.$inferInsert> = {};

  if (dto.name !== undefined) patch.name = dto.name;
  if (dto.baseUrl !== undefined) patch.baseUrl = dto.baseUrl.replace(/\/+$/, '');

  const tokenChanged = Boolean(dto.token);
  const baseUrlChanged = Boolean(dto.baseUrl);

  if (tokenChanged || baseUrlChanged) {
    const effectiveBaseUrl = patch.baseUrl ?? existing.baseUrl;
    const effectiveToken = tokenChanged ? dto.token! : decryptSecret(existing.encryptedToken);
    const client = new GitlabClient(effectiveBaseUrl, effectiveToken);
    await client.ping();

    if (tokenChanged) patch.encryptedToken = encryptSecret(dto.token!);
    patch.status = 'active';
    patch.lastCheckedAt = new Date();
  }

  if (Object.keys(patch).length === 0) {
    return existing;
  }

  const [updated] = await db
    .update(gitlabConnections)
    .set(patch)
    .where(eq(gitlabConnections.uid, uid))
    .returning(publicSelection);

  await recordAuditLog({
    userUid: actorUid,
    action: 'gitlab.connection.updated',
    entityType: 'gitlab_connection',
    entityId: updated.uid,
    details: {
      changedFields: Object.keys(patch).filter((k) => k !== 'encryptedToken'),
      tokenRotated: tokenChanged
    }
  });

  return updated;
};

export const deleteConnection = async (uid: string, actorUid?: string) => {
  const result = await db
    .delete(gitlabConnections)
    .where(eq(gitlabConnections.uid, uid))
    .returning({ uid: gitlabConnections.uid, name: gitlabConnections.name });
  if (result.length === 0) {
    throw new CustomError(HttpStatus.NOT_FOUND, 'GitLab connection not found');
  }
  await recordAuditLog({
    userUid: actorUid,
    action: 'gitlab.connection.deleted',
    entityType: 'gitlab_connection',
    entityId: uid,
    details: { name: result[0].name }
  });
};

/**
 * Проверить токен подключения без получения проектов.
 * Используется UI для индикатора статуса (галочка/крестик) и периодических
 * health-check'ов, не требующих полного списка проектов.
 */
export const testConnection = async (uid: string) => {
  const client = await buildClient(uid);
  try {
    const me = await client.ping();
    await markConnectionChecked(uid, 'active');
    return { ok: true, gitlabUserId: me.id, gitlabUsername: me.username };
  } catch (error) {
    await markConnectionChecked(uid, 'error');
    throw error;
  }
};

/**
 * Получить список доступных проектов с GitLab-инстанса (UC-01 шаг 6).
 * Расшифровывает токен и обращается к GET /projects?membership=true.
 */
export const fetchAvailableProjects = async (connectionUid: string) => {
  const client = await buildClient(connectionUid);
  try {
    const projects = await client.fetchProjects();
    await markConnectionChecked(connectionUid, 'active');
    return projects.map((p) => ({
      gitlabProjectId: p.id,
      name: p.name,
      path: p.path,
      pathWithNamespace: p.path_with_namespace ?? `${p.namespace.full_path}/${p.path}`,
      namespace: p.namespace.full_path,
      description: p.description,
      defaultBranch: p.default_branch,
      visibility: p.visibility,
      webUrl: p.web_url,
      lastActivityAt: p.last_activity_at
    }));
  } catch (error) {
    await markConnectionChecked(connectionUid, 'error');
    throw error;
  }
};

/**
 * Построить GitlabClient для существующего connection (расшифровка токена).
 * Хелпер для модулей sync/projects.
 */
export const buildClient = async (connectionUid: string): Promise<GitlabClient> => {
  const [conn] = await db
    .select()
    .from(gitlabConnections)
    .where(eq(gitlabConnections.uid, connectionUid));
  if (!conn) {
    throw new CustomError(HttpStatus.NOT_FOUND, 'GitLab connection not found');
  }
  const token = decryptSecret(conn.encryptedToken);
  return new GitlabClient(conn.baseUrl, token);
};

const markConnectionChecked = async (
  uid: string,
  status: 'active' | 'error'
): Promise<void> => {
  await db
    .update(gitlabConnections)
    .set({ status, lastCheckedAt: new Date() })
    .where(eq(gitlabConnections.uid, uid));
};
