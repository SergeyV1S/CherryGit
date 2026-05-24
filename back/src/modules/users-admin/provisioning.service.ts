import { hash } from 'bcrypt';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';

import { db } from '@/db/drizzle/connect';
import {
  gitlabConnections,
  gitlabUsers,
  projectGitlabUsers,
  userGitlabIdentities
} from '@/db/drizzle/schema/gitlab/schema';
import { users } from '@/db/drizzle/schema/user/schema';
import { logger } from '@/lib/loger';
import { recordAuditLog } from '@/modules/audit/audit.service';
import { CustomError } from '@/utils/custom_error';
import { HttpStatus } from '@/utils/enums/http-status';

/**
 * Сервис provisioning: превращает «увиденного GitLab-участника» в полноценный
 * CherryGit-аккаунт. Запускается автоматически из `projects.connectProject`
 * после первого discovery, а также вручную: `POST /admin/gitlab-users/provision`
 * (одиночный) и `POST /admin/gitlab-users/provision/bulk` (по списку UID или
 * по connection/project).
 *
 * Алгоритм для одного `gitlab_users` (gu):
 *  0. Если gu.mappedUserUid != null → skip (уже привязан).
 *  1. Резолв email: gu.email или fallback `${username}@${connectionHost}`.
 *  2. Поиск существующего CherryGit-юзера по email:
 *      a. Найден → mapped_user_uid := existing.uid, identity создаётся
 *         (если ещё нет), is_provisioned := true. Пароль НЕ меняется.
 *      b. Не найден → INSERT users (role=DEVELOPER, temp password,
 *         provisioned_at=now(), is_temp_password=true), затем identity.
 *  3. UPSERT user_gitlab_identities (per-connection): даёт sync.service
 *     возможность резолвить commits.authorUid этого юзера.
 *  4. Возврат — список созданных аккаунтов с **временными паролями
 *     в плейнтексте** (один раз — admin копирует и сообщает out-of-band).
 *
 * Идемпотентность гарантирована: повторный вызов на уже provisioned'ом
 * gu ничего не делает (mapped_user_uid != null проверка).
 *
 * Возврат plaintext-пароля — допустимое исключение из правила «никогда не
 * логировать пароли». Пароль:
 *  — генерируется ОДИН раз (crypto.randomBytes(12) → 16 chars base64url);
 *  — отдаётся ТОЛЬКО в HTTP-ответе админу (НЕ пишется в audit details);
 *  — в БД хранится bcrypt-хеш (PG_USER_ROUNDS = 10).
 * Это компромисс между UX (админу нужно сообщить пароли out-of-band) и
 * безопасностью (хеш в БД, plaintext только в эфемерном ответе).
 */

const BCRYPT_ROUNDS = 10;

/** Запись результата provision одного gitlab_user. */
export interface ProvisionedUserRecord {
  firstName: string;
  gitlabUsername: string;
  gitlabUserUid: string;
  mail: string;
  reason?: string;
  secondName: string;
  status: 'created' | 'reused' | 'skipped';
  /** Заполняется только если юзер был создан в этом вызове (НЕ при reuse). */
  temporaryPassword?: string;
  userUid: string;
}

export interface ProvisionReport {
  attempted: number;
  created: number;
  records: ProvisionedUserRecord[];
  reused: number;
  skipped: number;
}

/**
 * Авто-провижининг всех gitlab_users connection'а, у которых
 * mapped_user_uid IS NULL.
 *
 * Используется как fire-and-forget из createConnection (запасной путь)
 * либо синхронно из connectProject (admin видит пароли в ответе).
 */
export const provisionAllForConnection = async (
  actorUid: string | undefined,
  connectionUid: string
): Promise<ProvisionReport> => {
  const targets = await db
    .select({ uid: gitlabUsers.uid })
    .from(gitlabUsers)
    .where(
      and(eq(gitlabUsers.gitlabConnectionUid, connectionUid), isNull(gitlabUsers.mappedUserUid))
    );
  return provisionByUids(
    actorUid,
    targets.map((t) => t.uid),
    'connection'
  );
};

/**
 * Провижининг всех gitlab_users одного подключённого проекта.
 *
 * Берёт всех участников из `project_gitlab_users` (уже актуальный список
 * после discovery в `connectProject`), фильтрует тех, чей gitlab_user
 * ещё не provisioned, и прокидывает в `provisionByUids`.
 */
export const provisionForProject = async (
  actorUid: string | undefined,
  projectUid: string
): Promise<ProvisionReport> => {
  const targets = await db
    .select({ uid: gitlabUsers.uid })
    .from(projectGitlabUsers)
    .innerJoin(gitlabUsers, eq(gitlabUsers.uid, projectGitlabUsers.gitlabUserUid))
    .where(and(eq(projectGitlabUsers.projectUid, projectUid), isNull(gitlabUsers.mappedUserUid)));
  return provisionByUids(
    actorUid,
    targets.map((t) => t.uid),
    'project'
  );
};

/**
 * Точечный provisioning по списку gitlab_users.uid.
 * Используется ручным admin-endpoint'ом и обоими bulk-обёртками выше.
 *
 * Параметр `scope` уходит в audit details для аналитики:
 *  — 'connection' — авто-вызов после createConnection;
 *  — 'project'    — авто-вызов после connectProject;
 *  — 'manual'     — ручной admin-вызов.
 */
export const provisionByUids = async (
  actorUid: string | undefined,
  gitlabUserUids: string[],
  scope: 'connection' | 'manual' | 'project' = 'manual'
): Promise<ProvisionReport> => {
  if (gitlabUserUids.length === 0) {
    return { attempted: 0, created: 0, reused: 0, skipped: 0, records: [] };
  }

  // 1. Загрузить gitlab_users + connection (для baseUrl → email-fallback).
  const targets = await db
    .select({
      gu: gitlabUsers,
      connection: gitlabConnections
    })
    .from(gitlabUsers)
    .innerJoin(gitlabConnections, eq(gitlabConnections.uid, gitlabUsers.gitlabConnectionUid))
    .where(inArray(gitlabUsers.uid, gitlabUserUids));

  if (targets.length === 0) {
    throw new CustomError(HttpStatus.NOT_FOUND, 'gitlab_users not found');
  }

  const report: ProvisionReport = {
    attempted: targets.length,
    created: 0,
    reused: 0,
    skipped: 0,
    records: []
  };

  for (const { gu, connection } of targets) {
    try {
      const result = await provisionSingle(gu, connection);
      report.records.push(result);
      if (result.status === 'created') report.created += 1;
      else if (result.status === 'reused') report.reused += 1;
      else report.skipped += 1;
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      logger.warn(
        `provision: failed gitlab_user ${gu.gitlabUsername} (uid=${gu.uid}): ${message}`
      );
      report.skipped += 1;
      report.records.push({
        gitlabUserUid: gu.uid,
        gitlabUsername: gu.gitlabUsername,
        userUid: '',
        mail: '',
        firstName: '',
        secondName: '',
        status: 'skipped',
        reason: message
      });
    }
  }

  await recordAuditLog({
    userUid: actorUid,
    action: 'user.provisioned',
    entityType: 'gitlab_connection',
    details: {
      scope,
      attempted: report.attempted,
      created: report.created,
      reused: report.reused,
      skipped: report.skipped
    }
  });

  return report;
};

// ---------------------------------------------------------------------------
// Single user provisioning
// ---------------------------------------------------------------------------

/**
 * Один gitlab_user → один CherryGit user.
 * Не транзакционирует upsert identity — это допустимо: identity без
 * mapping не образуется, а гонка двух одновременных provision'ов одного
 * gitlab_user разрешится через `uq_user_per_connection`.
 */
const provisionSingle = async (
  gu: typeof gitlabUsers.$inferSelect,
  connection: typeof gitlabConnections.$inferSelect
): Promise<ProvisionedUserRecord> => {
  // 0. Уже привязан — нет работы.
  if (gu.mappedUserUid) {
    const [existing] = await db
      .select({ firstName: users.firstName, secondName: users.secondName, mail: users.mail })
      .from(users)
      .where(eq(users.uid, gu.mappedUserUid));
    return {
      gitlabUserUid: gu.uid,
      gitlabUsername: gu.gitlabUsername,
      userUid: gu.mappedUserUid,
      mail: existing?.mail ?? '',
      firstName: existing?.firstName ?? '',
      secondName: existing?.secondName ?? '',
      status: 'skipped',
      reason: 'already provisioned'
    };
  }

  // 1. Email с fallback'ом.
  const email = (gu.email && gu.email.trim().length > 0
    ? gu.email
    : `${gu.gitlabUsername}@${hostFromBaseUrl(connection.baseUrl)}`
  )
    .trim()
    .toLowerCase();

  // 2. Имя/фамилия из gitlab.name (Иван Иванов → first=Иван, second=Иванов).
  const { firstName, secondName } = splitFullName(gu.name, gu.gitlabUsername);

  // 3. Поиск существующего юзера по email.
  const [existing] = await db.select().from(users).where(eq(users.mail, email));

  if (existing) {
    // 3a. Перепривязываем gitlab_user к существующему.
    await db
      .update(gitlabUsers)
      .set({ mappedUserUid: existing.uid, isProvisioned: true })
      .where(eq(gitlabUsers.uid, gu.uid));
    await ensureIdentity(existing.uid, gu, connection.uid);
    return {
      gitlabUserUid: gu.uid,
      gitlabUsername: gu.gitlabUsername,
      userUid: existing.uid,
      mail: existing.mail,
      firstName: existing.firstName,
      secondName: existing.secondName,
      status: 'reused',
      reason:
        existing.provisionedAt === null
          ? 'mapped to existing user; provisioning marker untouched'
          : undefined
    };
  }

  // 3b. Создание нового CherryGit-юзера с временным паролем.
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hash(temporaryPassword, BCRYPT_ROUNDS);

  const [created] = await db
    .insert(users)
    .values({
      firstName,
      secondName,
      mail: email,
      password: passwordHash,
      role: 'DEVELOPER',
      provisionedAt: new Date(),
      isTempPassword: true
    })
    .returning();

  await db
    .update(gitlabUsers)
    .set({ mappedUserUid: created.uid, isProvisioned: true })
    .where(eq(gitlabUsers.uid, gu.uid));

  await ensureIdentity(created.uid, gu, connection.uid);

  return {
    gitlabUserUid: gu.uid,
    gitlabUsername: gu.gitlabUsername,
    userUid: created.uid,
    mail: created.mail,
    firstName: created.firstName,
    secondName: created.secondName,
    temporaryPassword,
    status: 'created'
  };
};

const ensureIdentity = async (
  userUid: string,
  gu: typeof gitlabUsers.$inferSelect,
  connectionUid: string
): Promise<void> => {
  await db
    .insert(userGitlabIdentities)
    .values({
      userUid,
      gitlabConnectionUid: connectionUid,
      gitlabUsername: gu.gitlabUsername,
      gitlabUserId: gu.gitlabUserId,
      email: gu.email ?? null
    })
    .onConflictDoNothing();
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const generateTemporaryPassword = (): string => randomBytes(12).toString('base64url');

const splitFullName = (
  fullName: string,
  fallbackUsername: string
): { firstName: string; secondName: string } => {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { firstName: fallbackUsername, secondName: '' };
  }
  if (parts.length === 1) {
    return { firstName: parts[0], secondName: fallbackUsername };
  }
  // [first, ...rest] — последнее слово в second; всё что между — в first
  // (для двух-слов: first=parts[0], second=parts[1]; для трёх: first="Иван
  // Сергеевич", second="Иванов" — отчество склеивается с именем, типичный
  // паттерн для российской локали GitLab).
  const secondName = parts[parts.length - 1];
  const firstName = parts.slice(0, -1).join(' ');
  return { firstName, secondName };
};

const hostFromBaseUrl = (baseUrl: string): string => {
  try {
    return new URL(baseUrl).hostname;
  } catch {
    return 'gitlab.local';
  }
};
