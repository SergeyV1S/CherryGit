import type {SQL} from 'drizzle-orm';

import { and, asc, eq, ilike, inArray, or, sql  } from 'drizzle-orm';

import { db } from '@/db/drizzle/connect';
import {
  gitlabConnections,
  gitlabUsers,
  projectGitlabUsers
} from '@/db/drizzle/schema/gitlab/schema';
import { users } from '@/db/drizzle/schema/user/schema';
import { CustomError } from '@/utils/custom_error';
import { HttpStatus } from '@/utils/enums/http-status';

/**
 * Сервис чтения «реестра GitLab-пользователей» (admin-only).
 *
 * Покрывает три задачи admin UI:
 *  1. «Кого нашли в проектах подключения N?» — фильтр по connectionUid.
 *  2. «Кто состоит в подключённом проекте P?» — фильтр по projectUid
 *     (через JOIN с project_gitlab_users).
 *  3. «Кто ещё не provisioned?» — фильтр по флагу is_provisioned (для
 *     UI кнопки «Создать аккаунты»).
 *
 * Поиск по подстроке (ilike) ведётся по name / gitlab_username / email
 * — те поля, по которым админ обычно ищет.
 */

export interface ListGitlabUsersFilter {
  connectionUid?: string;
  limit?: number;
  offset?: number;
  projectUid?: string;
  /** 'true' | 'false' | undefined */
  provisioned?: string;
  search?: string;
}

export const listGitlabUsers = async (filter: ListGitlabUsersFilter) => {
  const conditions: SQL[] = [];

  if (filter.connectionUid) {
    conditions.push(eq(gitlabUsers.gitlabConnectionUid, filter.connectionUid));
  }

  if (filter.search && filter.search.trim().length > 0) {
    const pattern = `%${filter.search.trim()}%`;
    conditions.push(
      or(
        ilike(gitlabUsers.name, pattern),
        ilike(gitlabUsers.gitlabUsername, pattern),
        ilike(gitlabUsers.email, pattern)
      )!
    );
  }

  if (filter.provisioned === 'true') conditions.push(eq(gitlabUsers.isProvisioned, true));
  if (filter.provisioned === 'false') conditions.push(eq(gitlabUsers.isProvisioned, false));

  // projectUid → JOIN через project_gitlab_users.
  // Если projectUid указан, ограничиваем по этому проекту.
  if (filter.projectUid) {
    const memberRows = await db
      .select({ uid: projectGitlabUsers.gitlabUserUid })
      .from(projectGitlabUsers)
      .where(eq(projectGitlabUsers.projectUid, filter.projectUid));
    const ids = memberRows.map((r) => r.uid);
    if (ids.length === 0) {
      return { items: [], total: 0 };
    }
    conditions.push(inArray(gitlabUsers.uid, ids));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 500);
  const offset = Math.max(filter.offset ?? 0, 0);

  const [items, totalRows] = await Promise.all([
    db
      .select({
        uid: gitlabUsers.uid,
        gitlabConnectionUid: gitlabUsers.gitlabConnectionUid,
        gitlabConnectionName: gitlabConnections.name,
        gitlabUserId: gitlabUsers.gitlabUserId,
        gitlabUsername: gitlabUsers.gitlabUsername,
        name: gitlabUsers.name,
        email: gitlabUsers.email,
        avatarUrl: gitlabUsers.avatarUrl,
        state: gitlabUsers.state,
        webUrl: gitlabUsers.webUrl,
        isProvisioned: gitlabUsers.isProvisioned,
        mappedUserUid: gitlabUsers.mappedUserUid,
        mappedUserMail: users.mail,
        mappedUserName: sql<string>`${users.firstName} || ' ' || ${users.secondName}`,
        lastSeenAt: gitlabUsers.lastSeenAt
      })
      .from(gitlabUsers)
      .leftJoin(gitlabConnections, eq(gitlabConnections.uid, gitlabUsers.gitlabConnectionUid))
      .leftJoin(users, eq(users.uid, gitlabUsers.mappedUserUid))
      .where(where)
      .orderBy(asc(gitlabUsers.name))
      .limit(limit)
      .offset(offset),
    db.select({ value: sql<number>`count(*)::int` }).from(gitlabUsers).where(where)
  ]);

  return { items, total: Number(totalRows[0]?.value ?? 0) };
};

export const getGitlabUser = async (uid: string) => {
  const [row] = await db
    .select({
      uid: gitlabUsers.uid,
      gitlabConnectionUid: gitlabUsers.gitlabConnectionUid,
      gitlabConnectionName: gitlabConnections.name,
      gitlabUserId: gitlabUsers.gitlabUserId,
      gitlabUsername: gitlabUsers.gitlabUsername,
      name: gitlabUsers.name,
      email: gitlabUsers.email,
      avatarUrl: gitlabUsers.avatarUrl,
      state: gitlabUsers.state,
      webUrl: gitlabUsers.webUrl,
      isProvisioned: gitlabUsers.isProvisioned,
      mappedUserUid: gitlabUsers.mappedUserUid,
      lastSeenAt: gitlabUsers.lastSeenAt
    })
    .from(gitlabUsers)
    .leftJoin(gitlabConnections, eq(gitlabConnections.uid, gitlabUsers.gitlabConnectionUid))
    .where(eq(gitlabUsers.uid, uid));

  if (!row) {
    throw new CustomError(HttpStatus.NOT_FOUND, 'gitlab_user not found');
  }
  return row;
};
