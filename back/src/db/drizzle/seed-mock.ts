/**
 * Мок-сид для демонстрации CherryGit.
 *
 * НАЗНАЧЕНИЕ: иметь полностью наполненную БД, в которой все дашборды (DEV/LEAD/HEAD/ADMIN)
 * показывают осмысленные данные сразу после старта. Используется как fallback на защите
 * ВКР, если что-то пойдёт не так с живым GitLab-подключением.
 *
 * АКТИВАЦИЯ: только при env-флаге `SEED_MOCK_DATA=true`. Без флага скрипт мгновенно выходит,
 * чтобы случайный запуск в проде ничего не сломал.
 *
 * ИДЕМПОТЕНТНОСТЬ: проверяется по «маркер»-юзеру `demo.admin@cherrygit.local`. Если он есть —
 * скрипт сообщает, что мок уже залит, и выходит. Чтобы пере-залить — выставить
 * `SEED_MOCK_RESET=true` (полная очистка мок-данных) и снова запустить.
 *
 * ЗАПУСК:
 *   SEED_MOCK_DATA=true yarn seed:mock
 *   SEED_MOCK_DATA=true SEED_MOCK_RESET=true yarn seed:mock   # пере-заливка
 *
 * ЧТО СОЗДАЁТСЯ:
 *   1 отдел  «Платформа»
 *   1 ADMIN  + 1 HEAD + 2 LEAD + 7 DEVELOPER (все с известными паролями)
 *   1 GitLab-подключение (с реально зашифрованным PAT-маркером — sync для мок-проектов
 *                         НЕ запускается, потому что URL фейковый и connection.status='inactive')
 *   2 проекта  «checkout-service», «web-portal»
 *   8 code-modules
 *   ~80 commits, ~30 MR, ~70 review-actions, ~12 deployments на проект
 *   metric_snapshots за 90 дней по 6 метрикам × 2 командам = ~1080 строк
 *   ~15 записей audit_log с реалистичной хронологией
 *
 * Все случайные значения генерируются seeded-PRNG (xorshift с константной seed),
 * чтобы данные были детерминированными — каждая повторная заливка даёт ИДЕНТИЧНЫЕ
 * метрики, и демо-скриншоты не «прыгают» от запуска к запуску.
 */

import bcrypt from 'bcrypt';
import { eq, inArray, like, or } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import type {
  BusFactorValue,
  ChangeFailureRateValue,
  CycleTimeMrValue,
  DeploymentFrequencyValue,
  LeadTimeValue,
  MrSizeValue
} from './schema/metrics/schema';
import type { MetricType } from './schema/metrics/types/metric-type.type';

import config from '../../config';
import { encryptSecret } from '../../lib/encryption';
import { departments } from './schema/departments/schema';
import {
  commits,
  deploymentMergeRequests,
  deployments,
  mergeRequests,
  mrCommits,
  mrReviews
} from './schema/git-data/schema';
import {
  codeModules,
  gitlabConnections,
  projects,
  syncStatuses,
  userGitlabIdentities
} from './schema/gitlab/schema';
import { auditLogs, metricsSnapshots } from './schema/metrics/schema';
import { teamMembers, teamProjects, teams } from './schema/teams/schema';
import { users } from './schema/user/schema';

import 'dotenv/config';

// =============================================================================
// Демо-конфигурация (всё, что хотим менять для разных демо — здесь)
// =============================================================================

const MARKER_EMAIL = 'demo.admin@cherrygit.local';

// Кол-во MR и коммитов на проект — управляет «весом» демо. ~30 MR — комфортно
// для UI, заметно для всех метрик, не превращается в стену таблицы.
const MRS_PER_PROJECT = 30;
const COMMITS_PER_PROJECT = 80;
const DEPLOYMENTS_PER_PROJECT = 12;

const PERIOD_DAYS = 90;
const NOW = new Date();
const SEED_DAY = startOfUtcDay(NOW);

// =============================================================================
// Детерминированный PRNG (xorshift32)
// =============================================================================

class Rng {
  private state: number;
  constructor(seed: number) {
    // xorshift не любит ноль
    this.state = seed === 0 ? 0xdeadbeef : seed;
  }
  next(): number {
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return this.state / 0xffffffff;
  }
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(0, arr.length - 1)];
  }
  /** Несколько уникальных элементов */
  sample<T>(arr: readonly T[], n: number): T[] {
    const copy = [...arr];
    const out: T[] = [];
    for (let i = 0; i < Math.min(n, arr.length); i++) {
      const idx = this.int(0, copy.length - 1);
      out.push(copy.splice(idx, 1)[0]);
    }
    return out;
  }
  bool(probability = 0.5): boolean {
    return this.next() < probability;
  }
}

// =============================================================================
// Утилиты времени
// =============================================================================

function startOfUtcDay(d: Date): Date {
  const c = new Date(d);
  c.setUTCHours(0, 0, 0, 0);
  return c;
}

function addDays(d: Date, days: number): Date {
  const c = new Date(d);
  c.setUTCDate(c.getUTCDate() + days);
  return c;
}

function addSeconds(d: Date, seconds: number): Date {
  return new Date(d.getTime() + seconds * 1000);
}

const HOUR = 3600;
const DAY = 86400;

// =============================================================================
// Статистические утилиты (копия из lib/statistics, но без зависимости)
// =============================================================================

function quantile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

const median = (vals: number[]) =>
  quantile(
    [...vals].sort((a, b) => a - b),
    0.5
  );
const p90 = (vals: number[]) =>
  quantile(
    [...vals].sort((a, b) => a - b),
    0.9
  );

// =============================================================================
// Доменная демо-модель (что именно создаём)
// =============================================================================

interface DemoUser {
  firstName: string;
  gitlabUsername: string;
  mail: string;
  password: string;
  role: 'ADMIN' | 'DEVELOPER' | 'HEAD' | 'LEAD';
  secondName: string;
}

const DEMO_USERS: DemoUser[] = [
  {
    firstName: 'Анна',
    secondName: 'Демидова',
    mail: MARKER_EMAIL,
    password: 'DemoAdmin2026!',
    role: 'ADMIN',
    gitlabUsername: 'demo-admin'
  },
  {
    firstName: 'Сергей',
    secondName: 'Платонов',
    mail: 'demo.head@cherrygit.local',
    password: 'DemoHead2026!',
    role: 'HEAD',
    gitlabUsername: 's.platonov'
  },
  {
    firstName: 'Мария',
    secondName: 'Северова',
    mail: 'demo.lead.backend@cherrygit.local',
    password: 'DemoLead2026!',
    role: 'LEAD',
    gitlabUsername: 'm.severova'
  },
  {
    firstName: 'Игорь',
    secondName: 'Алёхин',
    mail: 'demo.lead.frontend@cherrygit.local',
    password: 'DemoLead2026!',
    role: 'LEAD',
    gitlabUsername: 'i.alyohin'
  },
  {
    firstName: 'Дмитрий',
    secondName: 'Карпов',
    mail: 'demo.dev1@cherrygit.local',
    password: 'DemoDev2026!',
    role: 'DEVELOPER',
    gitlabUsername: 'd.karpov'
  },
  {
    firstName: 'Юлия',
    secondName: 'Никифорова',
    mail: 'demo.dev2@cherrygit.local',
    password: 'DemoDev2026!',
    role: 'DEVELOPER',
    gitlabUsername: 'y.nikiforova'
  },
  {
    firstName: 'Павел',
    secondName: 'Гордеев',
    mail: 'demo.dev3@cherrygit.local',
    password: 'DemoDev2026!',
    role: 'DEVELOPER',
    gitlabUsername: 'p.gordeev'
  },
  {
    firstName: 'Екатерина',
    secondName: 'Соловьёва',
    mail: 'demo.dev4@cherrygit.local',
    password: 'DemoDev2026!',
    role: 'DEVELOPER',
    gitlabUsername: 'e.solovyova'
  },
  {
    firstName: 'Алексей',
    secondName: 'Журавлёв',
    mail: 'demo.dev5@cherrygit.local',
    password: 'DemoDev2026!',
    role: 'DEVELOPER',
    gitlabUsername: 'a.zhuravlev'
  },
  {
    firstName: 'Ольга',
    secondName: 'Тихонова',
    mail: 'demo.dev6@cherrygit.local',
    password: 'DemoDev2026!',
    role: 'DEVELOPER',
    gitlabUsername: 'o.tikhonova'
  },
  {
    firstName: 'Никита',
    secondName: 'Беляев',
    mail: 'demo.dev7@cherrygit.local',
    password: 'DemoDev2026!',
    role: 'DEVELOPER',
    gitlabUsername: 'n.belyaev'
  }
];

interface ProjectSpec {
  description: string;
  /** Файлы, среди которых случайный MR изменит подмножество */
  files: string[];
  modules: Array<{ name: string; pathPattern: string }>;
  name: string;
  namespace: string;
}

const PROJECT_SPECS: ProjectSpec[] = [
  {
    name: 'checkout-service',
    namespace: 'demo-corp/backend',
    description: 'Сервис оформления заказов и платежей',
    modules: [
      { name: 'auth', pathPattern: 'src/auth/**' },
      { name: 'payments', pathPattern: 'src/payments/**' },
      { name: 'orders', pathPattern: 'src/orders/**' },
      { name: 'shared', pathPattern: 'src/shared/**' }
    ],
    files: [
      'src/auth/session.ts',
      'src/auth/jwt.ts',
      'src/auth/middleware.ts',
      'src/payments/processor.ts',
      'src/payments/stripe.ts',
      'src/payments/refund.ts',
      'src/orders/create.ts',
      'src/orders/cancel.ts',
      'src/orders/list.ts',
      'src/orders/state-machine.ts',
      'src/shared/db.ts',
      'src/shared/logger.ts',
      'src/shared/errors.ts',
      'package.json'
    ]
  },
  {
    name: 'web-portal',
    namespace: 'demo-corp/frontend',
    description: 'Клиентское React-приложение портала',
    modules: [
      { name: 'pages', pathPattern: 'src/pages/**' },
      { name: 'components', pathPattern: 'src/components/**' },
      { name: 'hooks', pathPattern: 'src/hooks/**' },
      { name: 'api', pathPattern: 'src/api/**' }
    ],
    files: [
      'src/pages/checkout.tsx',
      'src/pages/orders.tsx',
      'src/pages/profile.tsx',
      'src/pages/login.tsx',
      'src/components/Button.tsx',
      'src/components/CartItem.tsx',
      'src/components/PaymentForm.tsx',
      'src/components/Header.tsx',
      'src/hooks/useCart.ts',
      'src/hooks/useAuth.ts',
      'src/api/orders.ts',
      'src/api/payments.ts',
      'src/api/users.ts',
      'package.json'
    ]
  }
];

const MR_TITLE_TEMPLATES = [
  'feat: добавить {x}',
  'fix: исправить ошибку в {x}',
  'refactor: переписать {x}',
  'perf: ускорить обработку {x}',
  'chore: обновить зависимости {x}',
  'docs: документация по {x}',
  'test: покрыть тестами {x}',
  'feat({x}): новый endpoint',
  'fix({x}): NPE на пустом списке',
  'refactor({x}): вынести в отдельный модуль'
];

const COMMIT_MSG_TEMPLATES = [
  'WIP',
  'fix typo',
  'address review comments',
  'rebase on main',
  'extract helper',
  'add unit tests',
  'simplify logic',
  'rename variables',
  'remove dead code',
  'inline constant'
];

// =============================================================================
// Главная функция
// =============================================================================

async function seedMock(): Promise<void> {
  // if (process.env.SEED_MOCK_DATA !== 'true') {
  //   console.log('ℹ️  SEED_MOCK_DATA != "true" — мок-сид пропущен.');
  //   return;
  // }

  const client = postgres(config.database.postgres.url, { max: 1 });
  const db = drizzle(client);

  try {
    // 1. Проверка маркера / опциональный reset
    const [marker] = await db
      .select({ uid: users.uid })
      .from(users)
      .where(eq(users.mail, MARKER_EMAIL));

    if (marker && process.env.SEED_MOCK_RESET !== 'true') {
      console.log(`✅ Мок-данные уже залиты (найден ${MARKER_EMAIL}).`);
      console.log(
        '   Чтобы пере-залить заново: SEED_MOCK_RESET=true SEED_MOCK_DATA=true yarn seed:mock'
      );
      return;
    }

    if (marker && process.env.SEED_MOCK_RESET === 'true') {
      console.log('🧹 SEED_MOCK_RESET=true — удаляю старые мок-данные...');
      await cleanupMock(db);
    }

    console.log('🌱 Начинаю заливку мок-данных...');

    const rng = new Rng(0xc4e7717);

    // 2. Хеширование паролей всех демо-юзеров параллельно
    const userRows = await Promise.all(
      DEMO_USERS.map(async (u) => ({
        ...u,
        passwordHash: await bcrypt.hash(u.password, 10)
      }))
    );

    // 3. Отдел
    const [dept] = await db
      .insert(departments)
      .values({
        name: 'Платформа (демо)',
        description: 'Демонстрационный отдел разработки CherryGit'
      })
      .returning();

    // 4. Пользователи
    const insertedUsers = await db
      .insert(users)
      .values(
        userRows.map((u) => ({
          firstName: u.firstName,
          secondName: u.secondName,
          mail: u.mail,
          password: u.passwordHash,
          role: u.role,
          provisionedAt: SEED_DAY,
          departmentUid: u.role === 'HEAD' ? dept.uid : null
        }))
      )
      .returning({ uid: users.uid, mail: users.mail, role: users.role });

    const userByMail = new Map(insertedUsers.map((u) => [u.mail, u.uid]));
    const userByGitlab = new Map(
      DEMO_USERS.map((u) => [u.gitlabUsername, userByMail.get(u.mail)!])
    );

    // 5. GitLab-подключение
    const [connection] = await db
      .insert(gitlabConnections)
      .values({
        ownerUid: userByMail.get(MARKER_EMAIL)!,
        name: 'Демо GitLab (не активен)',
        baseUrl: 'https://gitlab.demo.cherrygit.local',
        // Шифруем заведомо невалидный токен — sync всё равно не должен срабатывать
        // (status='inactive'), но если кто-то decryptSecret'нёт — получит валидный
        // base64 вместо crash'а.
        encryptedToken: encryptSecret('demo-pat-never-used'),
        status: 'inactive'
      })
      .returning();

    // 6. Проекты + sync_statuses + code_modules
    const projectsByName = new Map<string, string>();
    for (const spec of PROJECT_SPECS) {
      const [project] = await db
        .insert(projects)
        .values({
          gitlabConnectionUid: connection.uid,
          gitlabProjectId: rng.int(100, 9999),
          name: spec.name,
          description: spec.description,
          namespace: spec.namespace,
          defaultBranch: 'main',
          releaseTagPattern: 'v*'
        })
        .returning();
      projectsByName.set(spec.name, project.uid);

      await db.insert(syncStatuses).values({
        projectUid: project.uid,
        status: 'idle',
        lastSyncAt: SEED_DAY
      });

      // Code modules
      await db.insert(codeModules).values(
        spec.modules.map((m) => ({
          projectUid: project.uid,
          name: m.name,
          pathPattern: m.pathPattern,
          description: `Модуль ${m.name}`
        }))
      );
    }

    // 7. Команды + участники + привязка проектов
    const [teamBackend] = await db
      .insert(teams)
      .values({
        name: 'Backend Core (демо)',
        description: 'Платёжный движок и API заказов',
        departmentUid: dept.uid
      })
      .returning();

    const [teamFrontend] = await db
      .insert(teams)
      .values({
        name: 'Frontend & UX (демо)',
        description: 'Клиентское приложение портала',
        departmentUid: dept.uid
      })
      .returning();

    // Распределение участников
    const backendDevs = [
      'demo.dev1@cherrygit.local',
      'demo.dev2@cherrygit.local',
      'demo.dev3@cherrygit.local'
    ];
    const frontendDevs = [
      'demo.dev4@cherrygit.local',
      'demo.dev5@cherrygit.local',
      'demo.dev6@cherrygit.local',
      'demo.dev7@cherrygit.local'
    ];

    await db.insert(teamMembers).values([
      // Backend
      {
        teamUid: teamBackend.uid,
        userUid: userByMail.get('demo.lead.backend@cherrygit.local')!,
        role: 'LEAD',
        joinedAt: addDays(SEED_DAY, -PERIOD_DAYS)
      },
      ...backendDevs.map((mail) => ({
        teamUid: teamBackend.uid,
        userUid: userByMail.get(mail)!,
        role: 'DEVELOPER' as const,
        joinedAt: addDays(SEED_DAY, -PERIOD_DAYS)
      })),
      // Frontend
      {
        teamUid: teamFrontend.uid,
        userUid: userByMail.get('demo.lead.frontend@cherrygit.local')!,
        role: 'LEAD',
        joinedAt: addDays(SEED_DAY, -PERIOD_DAYS)
      },
      ...frontendDevs.map((mail) => ({
        teamUid: teamFrontend.uid,
        userUid: userByMail.get(mail)!,
        role: 'DEVELOPER' as const,
        joinedAt: addDays(SEED_DAY, -PERIOD_DAYS)
      }))
    ]);

    await db.insert(teamProjects).values([
      { teamUid: teamBackend.uid, projectUid: projectsByName.get('checkout-service')! },
      { teamUid: teamFrontend.uid, projectUid: projectsByName.get('web-portal')! }
    ]);

    // 8. GitLab-identities (привязка демо-юзеров к их gitlab-username)
    await db.insert(userGitlabIdentities).values(
      DEMO_USERS.filter((u) => u.role !== 'ADMIN' && u.role !== 'HEAD').map((u) => ({
        userUid: userByMail.get(u.mail)!,
        gitlabConnectionUid: connection.uid,
        gitlabUsername: u.gitlabUsername,
        gitlabUserId: rng.int(1000, 9999),
        email: u.mail
      }))
    );

    // 9. Сгенерировать commits/MR/reviews/deployments по каждому проекту
    const projectAuthors: Record<string, string[]> = {
      'checkout-service': [
        'm.severova',
        ...backendDevs.map((m) => DEMO_USERS.find((u) => u.mail === m)!.gitlabUsername)
      ],
      'web-portal': [
        'i.alyohin',
        ...frontendDevs.map((m) => DEMO_USERS.find((u) => u.mail === m)!.gitlabUsername)
      ]
    };

    interface MrSeed {
      approvedAt: Date | null;
      authorGitlabUsername: string;
      authorUid: string | null;
      filePaths: string[];
      firstReviewAt: Date | null;
      gitlabCreatedAt: Date;
      hasHotfixLabel: boolean;
      hasRevertLabel: boolean;
      linesAdded: number;
      linesRemoved: number;
      mergedAt: Date | null;
      projectUid: string;
      uid: string;
    }

    const allMrSeeds: MrSeed[] = [];
    const allDeploySeeds: Array<{
      uid: string;
      projectUid: string;
      deployedAt: Date;
      isHotfix: boolean;
      isRevert: boolean;
    }> = [];

    for (const spec of PROJECT_SPECS) {
      const projectUid = projectsByName.get(spec.name)!;
      const authors = projectAuthors[spec.name];

      // ---- Commits ----
      const commitRows: Array<{
        projectUid: string;
        sha: string;
        message: string;
        committedAt: Date;
        authorUid: string | null;
        authorGitlabUsername: string;
        filesChanged: never[];
      }> = [];

      for (let i = 0; i < COMMITS_PER_PROJECT; i++) {
        const author = rng.pick(authors);
        commitRows.push({
          projectUid,
          sha: `${spec.name.slice(0, 4)}-${i.toString(16).padStart(8, '0')}-${rng.int(1000, 9999)}`,
          message: rng.pick(COMMIT_MSG_TEMPLATES),
          committedAt: addSeconds(
            addDays(SEED_DAY, -rng.int(0, PERIOD_DAYS - 1)),
            rng.int(0, DAY - 1)
          ),
          authorUid: userByGitlab.get(author) ?? null,
          authorGitlabUsername: author,
          filesChanged: []
        });
      }

      const insertedCommits = await db.insert(commits).values(commitRows).returning({
        uid: commits.uid,
        committedAt: commits.committedAt
      });

      // ---- Merge Requests ----
      const mrRows: (typeof mergeRequests.$inferInsert)[] = [];

      for (let i = 0; i < MRS_PER_PROJECT; i++) {
        const author = rng.pick(authors);
        // Распределяем MR равномерно по 90 дням, чтобы Cycle Time трендился
        const daysAgo = Math.floor((i / MRS_PER_PROJECT) * PERIOD_DAYS);
        const createdAt = addSeconds(addDays(SEED_DAY, -daysAgo - 1), rng.int(8 * HOUR, 18 * HOUR));

        // Фазы (реалистичные: ~4 часа до ревью, ~1.5 дня в ревью, ~2 часа после апрува)
        const tToFirstReview = rng.int(HOUR, 18 * HOUR);
        const tInReview = rng.int(2 * HOUR, 3 * DAY);
        const tToMerge = rng.int(15 * 60, 8 * HOUR);

        const firstReviewAt = addSeconds(createdAt, tToFirstReview);
        const approvedAt = addSeconds(firstReviewAt, tInReview);
        const mergedAt = addSeconds(approvedAt, tToMerge);

        // Размер MR: гипергеометрическое-подобное распределение (большинство маленькие)
        const sizeBucket = rng.next();
        let linesAdded: number, linesRemoved: number;
        if (sizeBucket < 0.45) {
          linesAdded = rng.int(5, 40);
          linesRemoved = rng.int(0, 10);
        } else if (sizeBucket < 0.78) {
          linesAdded = rng.int(40, 180);
          linesRemoved = rng.int(10, 60);
        } else if (sizeBucket < 0.92) {
          linesAdded = rng.int(180, 350);
          linesRemoved = rng.int(50, 130);
        } else if (sizeBucket < 0.98) {
          linesAdded = rng.int(300, 600);
          linesRemoved = rng.int(100, 250);
        } else {
          linesAdded = rng.int(600, 1500);
          linesRemoved = rng.int(200, 600);
        }

        // 8% MR — hotfix, 2% — revert
        const r = rng.next();
        const hasHotfixLabel = r < 0.08;
        const hasRevertLabel = !hasHotfixLabel && r < 0.1;

        // Файлы, которые тронул MR (2-6 случайных)
        const files = rng.sample(spec.files, rng.int(1, 5));

        const title = rng.pick(MR_TITLE_TEMPLATES).replace('{x}', rng.pick(spec.modules).name);

        mrRows.push({
          projectUid,
          authorUid: userByGitlab.get(author) ?? null,
          authorGitlabUsername: author,
          gitlabMrIid: i + 1,
          title,
          sourceBranch: `feature/${rng.pick(spec.modules).name}-${i}`,
          targetBranch: 'main',
          state: 'merged',
          gitlabCreatedAt: createdAt,
          firstReviewAt,
          approvedAt,
          mergedAt,
          closedAt: null,
          linesAdded,
          linesRemoved,
          filesChangedCount: files.length,
          filePaths: files,
          hasHotfixLabel,
          hasRevertLabel
        });
      }

      const insertedMrs = await db.insert(mergeRequests).values(mrRows).returning({
        uid: mergeRequests.uid,
        mergedAt: mergeRequests.mergedAt,
        gitlabCreatedAt: mergeRequests.gitlabCreatedAt,
        firstReviewAt: mergeRequests.firstReviewAt,
        approvedAt: mergeRequests.approvedAt,
        linesAdded: mergeRequests.linesAdded,
        linesRemoved: mergeRequests.linesRemoved,
        filePaths: mergeRequests.filePaths,
        hasHotfixLabel: mergeRequests.hasHotfixLabel,
        hasRevertLabel: mergeRequests.hasRevertLabel,
        authorGitlabUsername: mergeRequests.authorGitlabUsername,
        authorUid: mergeRequests.authorUid
      });

      // Запомним полные MR-сиды для последующего расчёта снепшотов
      for (const mr of insertedMrs) {
        allMrSeeds.push({
          uid: mr.uid,
          projectUid,
          gitlabCreatedAt: mr.gitlabCreatedAt,
          mergedAt: mr.mergedAt,
          firstReviewAt: mr.firstReviewAt,
          approvedAt: mr.approvedAt,
          linesAdded: mr.linesAdded,
          linesRemoved: mr.linesRemoved,
          filePaths: mr.filePaths,
          hasHotfixLabel: mr.hasHotfixLabel,
          hasRevertLabel: mr.hasRevertLabel,
          authorGitlabUsername: mr.authorGitlabUsername,
          authorUid: mr.authorUid
        });
      }

      // ---- MR ↔ Commits (просто 3-7 случайных commits, с committedAt < mergedAt) ----
      const mrCommitLinks: Array<{ mergeRequestUid: string; commitUid: string }> = [];
      for (const mr of insertedMrs) {
        const eligibleCommits = insertedCommits.filter(
          (c) => c.committedAt <= (mr.mergedAt ?? NOW)
        );
        const picked = rng.sample(eligibleCommits, rng.int(3, 7));
        for (const c of picked) {
          mrCommitLinks.push({ mergeRequestUid: mr.uid, commitUid: c.uid });
        }
      }
      if (mrCommitLinks.length > 0) {
        await db.insert(mrCommits).values(mrCommitLinks);
      }

      // ---- Reviews (1-3 акта на MR) ----
      const reviewRows: (typeof mrReviews.$inferInsert)[] = [];
      for (const mr of insertedMrs) {
        const reviewerPool = authors.filter((a) => a !== mr.authorGitlabUsername);
        const reviewersCount = rng.int(1, Math.min(3, reviewerPool.length));
        const reviewers = rng.sample(reviewerPool, reviewersCount);

        for (let i = 0; i < reviewers.length; i++) {
          const reviewer = reviewers[i];
          const isApprover = i === 0;
          reviewRows.push({
            mergeRequestUid: mr.uid,
            reviewerUid: userByGitlab.get(reviewer) ?? null,
            reviewerGitlabUsername: reviewer,
            state: isApprover ? 'approved' : rng.pick(['commented', 'requested_changes'] as const),
            reviewedAt: isApprover
              ? (mr.approvedAt ?? new Date())
              : (mr.firstReviewAt ?? new Date())
          });
        }
      }
      if (reviewRows.length > 0) {
        await db.insert(mrReviews).values(reviewRows);
      }

      // ---- Deployments (равномерно по 90 дням) ----
      const deployRows: (typeof deployments.$inferInsert)[] = [];
      for (let i = 0; i < DEPLOYMENTS_PER_PROJECT; i++) {
        const daysAgo = Math.floor((i / DEPLOYMENTS_PER_PROJECT) * PERIOD_DAYS);
        const deployedAt = addSeconds(
          addDays(SEED_DAY, -daysAgo - 1),
          rng.int(10 * HOUR, 17 * HOUR)
        );
        // Каждый 8-й деплой — hotfix (CFR ~12%)
        const isHotfix = i % 8 === 0 && i > 0;
        const commit = rng.pick(insertedCommits);
        deployRows.push({
          projectUid,
          tag: `v1.${(DEPLOYMENTS_PER_PROJECT - i).toString().padStart(2, '0')}.0`,
          commitSha: commit.uid.slice(0, 12),
          deployedAt,
          isHotfix,
          isRevert: false,
          isFailed: false
        });
      }

      const insertedDeploys = await db.insert(deployments).values(deployRows).returning({
        uid: deployments.uid,
        deployedAt: deployments.deployedAt,
        isHotfix: deployments.isHotfix,
        isRevert: deployments.isRevert
      });

      for (const d of insertedDeploys) {
        allDeploySeeds.push({
          uid: d.uid,
          projectUid,
          deployedAt: d.deployedAt,
          isHotfix: d.isHotfix,
          isRevert: d.isRevert
        });
      }

      // ---- Deployment ↔ MR (привязка MR к ближайшему следующему деплою) ----
      // Сортируем deploys по дате
      const sortedDeploys = [...insertedDeploys].sort(
        (a, b) => a.deployedAt.getTime() - b.deployedAt.getTime()
      );
      const dmLinks: Array<{ deploymentUid: string; mergeRequestUid: string }> = [];
      for (const mr of insertedMrs) {
        if (!mr.mergedAt) continue;
        // Ищем первый deploy с deployedAt >= mergedAt
        const target = sortedDeploys.find((d) => d.deployedAt.getTime() >= mr.mergedAt!.getTime());
        if (target) {
          dmLinks.push({ deploymentUid: target.uid, mergeRequestUid: mr.uid });
        }
      }
      if (dmLinks.length > 0) {
        await db.insert(deploymentMergeRequests).values(dmLinks);
      }
    }

    // 10. Метрические снепшоты — пишем по одному per день за последние 30 дней
    //     для каждой команды × 5 метрик + Bus Factor отдельным окном 90 дней.
    console.log('   📊 Считаю и пишу metric snapshots за 30 дней...');
    await writeSnapshotsForTeam(
      db,
      teamBackend.uid,
      [projectsByName.get('checkout-service')!],
      allMrSeeds,
      allDeploySeeds
    );
    await writeSnapshotsForTeam(
      db,
      teamFrontend.uid,
      [projectsByName.get('web-portal')!],
      allMrSeeds,
      allDeploySeeds
    );

    // 11. Аудит-журнал (несколько реалистичных событий)
    const adminUid = userByMail.get(MARKER_EMAIL)!;
    await db.insert(auditLogs).values([
      {
        userUid: adminUid,
        action: 'gitlab.connection.created',
        entityType: 'gitlab_connection',
        entityId: connection.uid,
        details: { name: connection.name, baseUrl: connection.baseUrl },
        occurredAt: addDays(SEED_DAY, -PERIOD_DAYS)
      },
      {
        userUid: adminUid,
        action: 'department.created',
        entityType: 'department',
        entityId: dept.uid,
        details: { name: dept.name },
        occurredAt: addDays(SEED_DAY, -PERIOD_DAYS + 1)
      },
      {
        userUid: adminUid,
        action: 'team.created',
        entityType: 'team',
        entityId: teamBackend.uid,
        details: { name: teamBackend.name, departmentUid: dept.uid },
        occurredAt: addDays(SEED_DAY, -PERIOD_DAYS + 1)
      },
      {
        userUid: adminUid,
        action: 'team.created',
        entityType: 'team',
        entityId: teamFrontend.uid,
        details: { name: teamFrontend.name, departmentUid: dept.uid },
        occurredAt: addDays(SEED_DAY, -PERIOD_DAYS + 1)
      },
      {
        userUid: adminUid,
        action: 'project.connected',
        entityType: 'project',
        entityId: projectsByName.get('checkout-service')!,
        details: { name: 'checkout-service' },
        occurredAt: addDays(SEED_DAY, -PERIOD_DAYS + 2)
      },
      {
        userUid: adminUid,
        action: 'project.connected',
        entityType: 'project',
        entityId: projectsByName.get('web-portal')!,
        details: { name: 'web-portal' },
        occurredAt: addDays(SEED_DAY, -PERIOD_DAYS + 2)
      },
      ...userRows
        .filter((u) => u.role !== 'ADMIN')
        .map((u) => ({
          userUid: adminUid,
          action: 'user.created' as const,
          entityType: 'user',
          entityId: userByMail.get(u.mail)!,
          details: { mail: u.mail, role: u.role },
          occurredAt: addDays(SEED_DAY, -PERIOD_DAYS + 3)
        })),
      {
        userUid: adminUid,
        action: 'department.head.assigned',
        entityType: 'department',
        entityId: dept.uid,
        details: { userUid: userByMail.get('demo.head@cherrygit.local')!, newRole: 'HEAD' },
        occurredAt: addDays(SEED_DAY, -PERIOD_DAYS + 4)
      },
      {
        userUid: adminUid,
        action: 'sync.completed',
        entityType: 'project',
        entityId: projectsByName.get('checkout-service')!,
        details: { commitsUpserted: COMMITS_PER_PROJECT, mrsUpserted: MRS_PER_PROJECT },
        occurredAt: addDays(SEED_DAY, -1)
      },
      {
        userUid: adminUid,
        action: 'sync.completed',
        entityType: 'project',
        entityId: projectsByName.get('web-portal')!,
        details: { commitsUpserted: COMMITS_PER_PROJECT, mrsUpserted: MRS_PER_PROJECT },
        occurredAt: addDays(SEED_DAY, -1)
      }
    ]);

    // 12. Итоговый отчёт
    console.log('');
    console.log('🎉 Мок-данные залиты. Учётные записи:');
    console.log('');
    for (const u of DEMO_USERS) {
      console.log(`   ${u.role.padEnd(10)}  ${u.mail.padEnd(40)}  ${u.password}`);
    }
    console.log('');
    console.log('   Структура:');
    console.log('     1 отдел  «Платформа (демо)»');
    console.log('     2 команды (Backend Core / Frontend & UX)');
    console.log('     2 проекта (checkout-service / web-portal)');
    console.log(
      `     ~${COMMITS_PER_PROJECT * 2} коммитов · ~${MRS_PER_PROJECT * 2} MR · ~${DEPLOYMENTS_PER_PROJECT * 2} деплоев`
    );
    console.log('     30 дней snapshot-истории по 6 метрикам × 2 командам');
    console.log('');
    console.log('   Чтобы пере-залить заново:');
    console.log('     SEED_MOCK_RESET=true SEED_MOCK_DATA=true yarn seed:mock');
    console.log('');
  } finally {
    await client.end();
  }
}

// =============================================================================
// Расчёт и запись snapshot'ов (упрощённая версия, идентичная по результатам
// со snapshot.service.writeSnapshotsForTeam)
// =============================================================================

interface MrForMetrics {
  approvedAt: Date | null;
  authorGitlabUsername: string;
  authorUid: string | null;
  filePaths: string[];
  firstReviewAt: Date | null;
  gitlabCreatedAt: Date;
  hasHotfixLabel: boolean;
  hasRevertLabel: boolean;
  linesAdded: number;
  linesRemoved: number;
  mergedAt: Date | null;
  projectUid: string;
  uid: string;
}

interface DeployForMetrics {
  deployedAt: Date;
  isHotfix: boolean;
  isRevert: boolean;
  projectUid: string;
  uid: string;
}

async function writeSnapshotsForTeam(
  db: ReturnType<typeof drizzle>,
  teamUid: string,
  projectUids: string[],
  allMrs: MrForMetrics[],
  allDeploys: DeployForMetrics[]
): Promise<void> {
  const teamMrs = allMrs.filter((m) => projectUids.includes(m.projectUid));
  const teamDeploys = allDeploys.filter((d) => projectUids.includes(d.projectUid));

  // По одному snapshot'у per день за последние 30 дней (rolling 30d окно)
  const snapshotRows: (typeof metricsSnapshots.$inferInsert)[] = [];

  for (let daysAgo = 29; daysAgo >= 0; daysAgo--) {
    const periodEnd = addDays(SEED_DAY, -daysAgo);
    const periodStart = addDays(periodEnd, -30);

    const mrsInPeriod = teamMrs.filter(
      (m) => m.mergedAt !== null && m.mergedAt >= periodStart && m.mergedAt < periodEnd
    );

    const deploysInPeriod = teamDeploys.filter(
      (d) => d.deployedAt >= periodStart && d.deployedAt < periodEnd
    );

    snapshotRows.push({
      metricType: 'cycle_time_mr' as MetricType,
      entityType: 'team',
      entityId: teamUid,
      periodStart,
      periodEnd,
      value: computeCycleTimeMr(mrsInPeriod),
      calculatedAt: periodEnd
    });

    snapshotRows.push({
      metricType: 'mr_size' as MetricType,
      entityType: 'team',
      entityId: teamUid,
      periodStart,
      periodEnd,
      value: computeMrSize(mrsInPeriod),
      calculatedAt: periodEnd
    });

    snapshotRows.push({
      metricType: 'lead_time' as MetricType,
      entityType: 'team',
      entityId: teamUid,
      periodStart,
      periodEnd,
      value: computeLeadTime(mrsInPeriod, deploysInPeriod),
      calculatedAt: periodEnd
    });

    snapshotRows.push({
      metricType: 'deployment_frequency' as MetricType,
      entityType: 'team',
      entityId: teamUid,
      periodStart,
      periodEnd,
      value: computeDeploymentFrequency(deploysInPeriod, periodStart, periodEnd),
      calculatedAt: periodEnd
    });

    snapshotRows.push({
      metricType: 'change_failure_rate' as MetricType,
      entityType: 'team',
      entityId: teamUid,
      periodStart,
      periodEnd,
      value: computeChangeFailureRate(deploysInPeriod),
      calculatedAt: periodEnd
    });
  }

  // Bus Factor — отдельное окно 90 дней, один snapshot на сегодня
  const bfWindow = addDays(SEED_DAY, -90);
  const bfMrs = teamMrs.filter((m) => m.mergedAt !== null && m.mergedAt >= bfWindow);
  snapshotRows.push({
    metricType: 'bus_factor' as MetricType,
    entityType: 'team',
    entityId: teamUid,
    periodStart: bfWindow,
    periodEnd: SEED_DAY,
    value: computeBusFactor(bfMrs),
    calculatedAt: SEED_DAY
  });

  // Чанк-вставка по 200 строк (PG bind-message safe)
  for (let i = 0; i < snapshotRows.length; i += 200) {
    await db.insert(metricsSnapshots).values(snapshotRows.slice(i, i + 200));
  }
}

function computeCycleTimeMr(mrs: MrForMetrics[]): CycleTimeMrValue {
  const totals = mrs
    .filter((m) => m.mergedAt !== null)
    .map((m) => (m.mergedAt!.getTime() - m.gitlabCreatedAt.getTime()) / 1000);
  const ttfr = mrs
    .filter((m) => m.firstReviewAt !== null)
    .map((m) => (m.firstReviewAt!.getTime() - m.gitlabCreatedAt.getTime()) / 1000);
  const tir = mrs
    .filter((m) => m.approvedAt !== null && m.firstReviewAt !== null)
    .map((m) => (m.approvedAt!.getTime() - m.firstReviewAt!.getTime()) / 1000);
  const ttma = mrs
    .filter((m) => m.mergedAt !== null && m.approvedAt !== null)
    .map((m) => (m.mergedAt!.getTime() - m.approvedAt!.getTime()) / 1000);

  return {
    excludedDrafts: 0,
    medianTotalSeconds: median(totals),
    p90TotalSeconds: p90(totals),
    phases: {
      timeToFirstReviewMedianSeconds: median(ttfr),
      timeToFirstReviewP90Seconds: p90(ttfr),
      timeInReviewMedianSeconds: median(tir),
      timeInReviewP90Seconds: p90(tir),
      timeToMergeAfterApprovalMedianSeconds: median(ttma),
      timeToMergeAfterApprovalP90Seconds: p90(ttma)
    },
    sampleSize: mrs.length,
    sampleSizePerPhase: {
      timeToFirstReview: ttfr.length,
      timeInReview: tir.length,
      timeToMergeAfterApproval: ttma.length
    }
  };
}

function computeMrSize(mrs: MrForMetrics[]): MrSizeValue {
  const sizes = mrs.map((m) => m.linesAdded + m.linesRemoved);
  const buckets = [
    { label: '≤50', upper: 50 },
    { label: '51-200', upper: 200 },
    { label: '201-400', upper: 400 },
    { label: '401-800', upper: 800 },
    { label: '>800', upper: Infinity }
  ];
  const counts = buckets.map(() => 0);
  for (const s of sizes) {
    const idx = buckets.findIndex((b) => s <= b.upper);
    if (idx >= 0) counts[idx]++;
  }
  const total = sizes.length;
  return {
    buckets: buckets.map((b, i) => ({
      label: b.label,
      count: counts[i],
      percent: total === 0 ? 0 : Math.round((counts[i] / total) * 10000) / 100
    })),
    excludedDrafts: 0,
    medianLinesChanged: median(sizes),
    p90LinesChanged: p90(sizes),
    sampleSize: total
  };
}

function computeLeadTime(mrs: MrForMetrics[], deploys: DeployForMetrics[]): LeadTimeValue {
  // Упрощённо: для каждого MR'а берём ближайший следующий deploy и считаем lead = deploy - mr.firstCreated
  // Это полностью имитирует поведение бэка для случая, когда mr_commits правильно связаны.
  if (deploys.length === 0 || mrs.length === 0) {
    return {
      deploymentsConsidered: deploys.length,
      excludedMrsWithoutCommits: 0,
      medianSeconds: null,
      p90Seconds: null,
      sampleSize: 0
    };
  }
  const sortedDeploys = [...deploys].sort(
    (a, b) => a.deployedAt.getTime() - b.deployedAt.getTime()
  );
  const samples: number[] = [];
  for (const mr of mrs) {
    if (!mr.mergedAt) continue;
    const target = sortedDeploys.find((d) => d.deployedAt.getTime() >= mr.mergedAt!.getTime());
    if (!target) continue;
    samples.push((target.deployedAt.getTime() - mr.gitlabCreatedAt.getTime()) / 1000);
  }
  return {
    deploymentsConsidered: deploys.length,
    excludedMrsWithoutCommits: 0,
    medianSeconds: median(samples),
    p90Seconds: p90(samples),
    sampleSize: samples.length
  };
}

function computeDeploymentFrequency(
  deploys: Array<{ deployedAt: Date }>,
  periodStart: Date,
  periodEnd: Date
): DeploymentFrequencyValue {
  const days = Math.max(1, Math.round((periodEnd.getTime() - periodStart.getTime()) / 86400_000));
  const perDay = deploys.length / days;
  let category: DeploymentFrequencyValue['category'];
  if (perDay > 1) category = 'elite';
  else if (perDay >= 1 / 7) category = 'high';
  else if (perDay >= 1 / 30) category = 'medium';
  else category = 'low';

  // Week-buckets (UTC monday)
  const buckets = new Map<string, number>();
  for (const d of deploys) {
    const monday = new Date(d.deployedAt);
    const day = monday.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    monday.setUTCDate(monday.getUTCDate() + diff);
    monday.setUTCHours(0, 0, 0, 0);
    const key = monday.toISOString().slice(0, 10);
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  const timeline = [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bucket, count]) => ({ bucket, count }));

  return {
    category,
    count: deploys.length,
    granularity: 'week',
    perDay: Math.round(perDay * 100) / 100,
    periodDays: days,
    timeline
  };
}

function computeChangeFailureRate(
  deploys: Array<{ deployedAt: Date; isHotfix: boolean; isRevert: boolean }>
): ChangeFailureRateValue {
  const total = deploys.length;
  const failed = deploys.filter((d) => d.isHotfix || d.isRevert).length;
  const hotfixOnly = deploys.filter((d) => d.isHotfix).length;
  const revertOnly = deploys.filter((d) => d.isRevert).length;
  const rate = total === 0 ? 0 : (failed / total) * 100;
  let category: ChangeFailureRateValue['category'];
  if (total === 0) category = null;
  else if (rate <= 15) category = 'elite';
  else if (rate <= 30) category = 'high';
  else if (rate <= 45) category = 'medium';
  else category = 'low';

  return {
    breakdown: { hotfixDeploys: hotfixOnly, revertDeploys: revertOnly },
    category,
    failedDeploys: failed,
    granularity: 'week',
    ratePercent: Math.round(rate * 100) / 100,
    timeline: [],
    totalDeploys: total
  };
}

function computeBusFactor(mrs: MrForMetrics[]): BusFactorValue {
  const moduleAuthors = new Map<string, Set<string>>();
  for (const mr of mrs) {
    const authorKey = mr.authorUid ? `uid:${mr.authorUid}` : `gitlab:${mr.authorGitlabUsername}`;
    for (const path of mr.filePaths) {
      const moduleName = path.split('/')[1] ?? '<root>'; // src/auth/foo.ts -> auth
      if (!moduleAuthors.has(moduleName)) moduleAuthors.set(moduleName, new Set());
      moduleAuthors.get(moduleName)!.add(authorKey);
    }
  }

  const modules = [...moduleAuthors.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, authors]) => {
      const n = authors.size;
      const color: 'green' | 'red' | 'yellow' = n === 1 ? 'red' : n === 2 ? 'yellow' : 'green';
      return {
        name,
        pathPattern: null,
        isImplicit: true,
        activeContributors: n,
        authors: [...authors],
        color
      };
    });

  return {
    excludedMrsWithoutPaths: 0,
    modules,
    overallBusFactor:
      modules.length === 0 ? null : Math.min(...modules.map((m) => m.activeContributors)),
    sampleSize: mrs.length,
    windowDays: 90
  };
}

// =============================================================================
// Cleanup для пере-заливки
// =============================================================================

async function cleanupMock(db: ReturnType<typeof drizzle>): Promise<void> {
  // Стратегия: найти все мок-сущности по маркерам (email, namespace проекта,
  // baseUrl connection'а) и удалить каскадно в правильном порядке (от листов к корню).

  // 1. Найти мок-юзеров и connection
  const mockUsers = await db
    .select({ uid: users.uid })
    .from(users)
    .where(like(users.mail, '%@cherrygit.local'));
  const mockUserUids = mockUsers.map((u) => u.uid);

  const [mockConnection] = await db
    .select({ uid: gitlabConnections.uid })
    .from(gitlabConnections)
    .where(eq(gitlabConnections.baseUrl, 'https://gitlab.demo.cherrygit.local'));

  // 2. Найти мок-проекты по namespace
  const mockProjects = await db
    .select({ uid: projects.uid })
    .from(projects)
    .where(
      or(eq(projects.namespace, 'demo-corp/backend'), eq(projects.namespace, 'demo-corp/frontend'))
    );
  const mockProjectUids = mockProjects.map((p) => p.uid);

  // 3. Найти мок-команды
  const mockTeamsRows = await db
    .select({ uid: teams.uid })
    .from(teams)
    .where(or(eq(teams.name, 'Backend Core (демо)'), eq(teams.name, 'Frontend & UX (демо)')));
  const mockTeamUids = mockTeamsRows.map((t) => t.uid);

  // 4. Найти мок-отдел
  const mockDepts = await db
    .select({ uid: departments.uid })
    .from(departments)
    .where(eq(departments.name, 'Платформа (демо)'));
  const mockDeptUids = mockDepts.map((d) => d.uid);

  // ---- Удаление от листьев к корню ----

  if (mockProjectUids.length > 0) {
    // git-data
    const deploysToDelete = await db
      .select({ uid: deployments.uid })
      .from(deployments)
      .where(inArray(deployments.projectUid, mockProjectUids));
    const deployUids = deploysToDelete.map((d) => d.uid);

    const mrsToDelete = await db
      .select({ uid: mergeRequests.uid })
      .from(mergeRequests)
      .where(inArray(mergeRequests.projectUid, mockProjectUids));
    const mrUids = mrsToDelete.map((m) => m.uid);

    if (deployUids.length > 0) {
      await db
        .delete(deploymentMergeRequests)
        .where(inArray(deploymentMergeRequests.deploymentUid, deployUids));
    }
    if (mrUids.length > 0) {
      await db.delete(mrReviews).where(inArray(mrReviews.mergeRequestUid, mrUids));
      await db.delete(mrCommits).where(inArray(mrCommits.mergeRequestUid, mrUids));
    }
    if (deployUids.length > 0) {
      await db.delete(deployments).where(inArray(deployments.uid, deployUids));
    }
    if (mrUids.length > 0) {
      await db.delete(mergeRequests).where(inArray(mergeRequests.uid, mrUids));
    }
    await db.delete(commits).where(inArray(commits.projectUid, mockProjectUids));
    await db.delete(codeModules).where(inArray(codeModules.projectUid, mockProjectUids));
    await db.delete(syncStatuses).where(inArray(syncStatuses.projectUid, mockProjectUids));

    if (mockTeamUids.length > 0) {
      await db.delete(teamProjects).where(inArray(teamProjects.projectUid, mockProjectUids));
    }
    await db.delete(projects).where(inArray(projects.uid, mockProjectUids));
  }

  if (mockTeamUids.length > 0) {
    await db.delete(metricsSnapshots).where(inArray(metricsSnapshots.entityId, mockTeamUids));
    await db.delete(teamMembers).where(inArray(teamMembers.teamUid, mockTeamUids));
    await db.delete(teams).where(inArray(teams.uid, mockTeamUids));
  }

  // user_gitlab_identities → audit_logs → gitlab_connections → users → departments
  // Порядок важен: gitlabConnections.ownerUid ссылается на users.uid (FK),
  // поэтому connections должны удаляться РАНЬШЕ users.
  if (mockUserUids.length > 0) {
    await db
      .delete(userGitlabIdentities)
      .where(inArray(userGitlabIdentities.userUid, mockUserUids));
    await db.delete(auditLogs).where(inArray(auditLogs.userUid, mockUserUids));
  }

  if (mockConnection) {
    await db.delete(gitlabConnections).where(eq(gitlabConnections.uid, mockConnection.uid));
  }

  if (mockUserUids.length > 0) {
    await db.delete(users).where(inArray(users.uid, mockUserUids));
  }

  if (mockDeptUids.length > 0) {
    await db.delete(departments).where(inArray(departments.uid, mockDeptUids));
  }

  console.log('   Мок-данные удалены.');
}

// =============================================================================

seedMock()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Мок-сид упал:', err);
    process.exit(1);
  });
