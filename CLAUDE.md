# CLAUDE.md — CherryGit (ВКР Яцук С.Н., 2026)

## Что такое CherryGit

**CherryGit** — информационная система диагностики процессов разработки программного обеспечения на основе анализа данных Git-репозиториев (GitLab). Собирает коммиты, merge-request'ы, ревью и теги релизов, рассчитывает метрики по моделям **DORA** и **SPACE** с учётом методологического ограничителя **закона Гудхарта**, и визуализирует результаты в **четырёх ролевых дашбордах** (Developer / Lead / Head / Admin).

**Главный тезис ВКР** (раздел 2.1.5 + 3.1 SWOT): система отвечает на вопрос «как помочь команде увидеть свой процесс?», а не «как измерить каждого сотрудника». Это выражено **архитектурно** — через ролевую сегрегацию видимости данных **на уровне REST API**, а не на уровне настроек UI.

**Целевая аудитория** (ВКР 2.1.2):

- **Разработчик** — индивидуальные метрики собственной работы + командный baseline для сопоставления + история своих показателей.
- **Тимлид** — командные агрегаты + декомпозиция Cycle Time MR + Bus Factor + сигналы аномалий (без раскрытия индивидуальных значений).
- **Руководитель отдела** — кросс-командные DORA-метрики + сравнительная динамика команд.
- **Администратор** — управление GitLab-подключениями, проектами, командами, отделами, пользователями, журналом аудита (**без доступа к содержательным значениям метрик**).

**Развёртывание** (ВКР 2.1.4 FR-08, 3.6.1): локально через `docker compose up`, без зависимости от облачных сервисов — это закрывает требования ФЗ-152 к локализации обрабатываемых данных российских организаций.

---

## Документы и источники истины

| Файл                                                | Назначение                                                                              |
| --------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `ВКР_ЯЦУК_CHERRYGIT.docx`                          | Канонический текст дипломной работы — **первичный источник истины** по требованиям     |
| `_vkr.txt`                                          | Распакованный plain-text ВКР (для grep'а в этом файле AI-агентами)                     |
| `_vkr_unpacked/`                                    | Распакованный архив `.docx` (для извлечения отдельных частей XML, если нужно)          |
| `CherryGit_концепция_v2.pdf`                       | Концептуальное описание идеи и метрик (исторически — предшественник ВКР)               |
| `План_содержания_ВКР_CherryGit.docx`               | План содержания диплома                                                                |
| `Вопросы и ответы.txt`                              | FAQ для защиты — типовые вопросы комиссии                                              |
| `ДОРАБОТКИ.md`                                      | **Журнал реализации** с per-FR статусами, известными ограничениями и связями разделов  |

---

## Структура репозитория

```
Диплом/
├── CLAUDE.md                          ← этот файл
├── ДОРАБОТКИ.md                       ← журнал реализации (FR-XX + аудит + готовность)
├── ВКР_ЯЦУК_CHERRYGIT.docx
├── _vkr.txt, _vkr_unpacked/
├── CherryGit_концепция_v2.pdf
├── План_содержания_ВКР_CherryGit.docx
├── Вопросы и ответы.txt
├── front/                             ← React-фронтенд
├── back/                              ← Express-бэкенд
├── BPMN/                              ← BPMN-диаграммы (Camunda Modeler)
│   ├── Основной процесс/
│   ├── Подключение проекта/
│   └── Просмотр командного дашборда/
├── User Flow/user_flow.svg
├── class-diagram/                     ← UML-диаграмма классов (PlantUML + PNG/SVG)
├── Диаграмма развертывания/          ← UML-диаграмма развёртывания
└── use-case.png                       ← UML-диаграмма прецедентов
```

---

## Технологический стек

### Бэкенд

| Технология                | Версия    | Назначение                                                  |
| ------------------------- | --------- | ----------------------------------------------------------- |
| Node.js                   | 22 LTS    | Среда выполнения (ВКР 2.2.5)                                |
| Express.js                | 4.x       | REST API + middleware-цепочки                               |
| TypeScript                | 5.x       | Типизация (strict mode)                                     |
| Drizzle ORM               | 0.31      | Type-safe ORM + миграции                                    |
| PostgreSQL                | 15+       | Основная БД (с JSONB для metric snapshots)                  |
| Redis                     | 7         | Хранение refresh-токенов, rate-limiting login по IP         |
| Zod                       | 3.x       | Валидация env, DTO, query-params                            |
| bcrypt                    | 5.x       | Хеширование паролей (rounds=10)                             |
| jsonwebtoken              | 9.x       | JWT access/refresh                                          |
| axios                     | 1.x       | GitLab API клиент                                           |
| csv-stringify             | 6.x       | Экспорт CSV (FR-12)                                         |
| winston + morgan          | —         | Структурированное логирование + access-log                  |
| swagger-ui-express        | —         | OpenAPI документация (`/docs`)                              |
| Jest                      | —         | Тесты (используется минимально, см. ДОРАБОТКИ 8.3)          |

### Фронтенд

| Технология             | Версия | Назначение                                       |
| ---------------------- | ------ | ------------------------------------------------ |
| React                  | 19     | UI-фреймворк                                     |
| TypeScript             | 5.x    | Типизация                                        |
| Vite                   | 8      | Сборка + dev-сервер                              |
| React Compiler         | —      | Автомемоизация (babel-plugin-react-compiler)     |
| React Router           | 7      | Маршрутизация (`createBrowserRouter`)            |
| Tailwind CSS           | 4      | Стилизация                                       |
| shadcn/ui (radix + cva)| —      | UI-компоненты                                    |
| @tanstack/react-query  | 5      | Серверное состояние + кеш                        |
| Axios                  | 1.x    | HTTP-клиент (`withCredentials: true`)            |
| Zod                    | 3.x    | Валидация форм                                   |
| react-hook-form        | 7.x    | Управление формами                               |
| @phosphor-icons/react  | —      | Иконки                                           |

---

## Архитектура (ВКР 3.6)

Многоуровневая, физически разделена на три слоя:

1. **Слой представления** — React-SPA (`front/`).
2. **Слой бизнес-логики** — Express-приложение на Node.js (`back/`); включает планировщик `node-cron` (sync GitLab), модули расчёта метрик, ролевой middleware.
3. **Слой хранения** — PostgreSQL 15 + Redis (для refresh-токенов и rate-limit).

**Раздача статики + TLS-терминация + проксирование `/api`** — отдельный nginx (вне docker-compose разработки; в проде — четвёртый контейнер). Подробности в `Диаграмма развертывания/`.

**Защита приватности — defence-in-depth**:

1. **Route-level**: `requireRole(...)` middleware отбрасывает по глобальной роли.
2. **Service-level**: `assertTeamAccess(actorUid, teamUid)` проверяет per-team scope (LEAD → должен быть `team_members.role='LEAD'` именно этой команды; HEAD → команда должна принадлежать его отделу; DEV → должен быть членом команды).
3. **Bundle-level**: `canViewTeamMetric(accessMode, metricType)` фильтрует ответ — HEAD получает CT MR / MR Size как `null`, потому что это review-метрики, недоступные ему по матрице ВКР 2.2.7.

Все три ступени независимы — даже если одна обходится (баг middleware, опечатка в route mount), остальные продолжают защищать. См. `ДОРАБОТКИ.md §3.1, §3.2`.

---

## Функциональные требования (ВКР 2.1.4 + MoSCoW 3.2.1)

Все FR пронумерованы по ВКР. Статусы реализации — по `ДОРАБОТКИ.md`.

### Must have (M) — ядро системы

| FR    | Требование                                                                                        | Статус |
| ----- | ------------------------------------------------------------------------------------------------- | ------ |
| FR-01 | Подключение к произвольному GitLab (cloud/self-hosted) с авторизацией по PAT                      | ✅ 100% |
| FR-02 | Периодический инкрементальный сбор данных из репозиториев                                         | ✅ 90% |
| FR-03 | Определение деплоев по тегам репозитория (glob-паттерн), хотфиксов/откатов — по меткам MR        | ✅ 90% |
| FR-04 | Расчёт DORA: Lead Time, Deployment Frequency, Change Failure Rate (медиана + p90)                | ✅ 95% |
| FR-05 | Три ролевых дашборда: разработчика, тимлида, руководителя отдела                                 | ✅ 95% |
| FR-06 | **Парная визуализация**: метрики скорости рядом с метриками качества (DF↔CFR, CT MR↔MR Size)     | ✅ 95% |
| FR-07 | Ролевое разграничение на уровне API с 403 при попытке выйти за scope                              | ✅ 95% |
| FR-08 | Развёртывание через docker-compose без зависимости от облачных сервисов                          | 🟡 70% |

### Should have (S) — важно, но не блокирует ядро

| FR    | Требование                                                                                            | Статус |
| ----- | ----------------------------------------------------------------------------------------------------- | ------ |
| FR-09 | Cycle Time MR с декомпозицией на 3 фазы (до ревью / в ревью / от апрува до мержа)                    | ✅ 95% |
| FR-10 | Bus Factor по модулям кодовой базы (окно 90 дней; единственный контрибьютор = риск)                  | ✅ 90% |
| FR-11 | Блок с формулой расчёта и источниками данных для каждой метрики прямо в UI                            | ✅ 95% |
| FR-12 | Экспорт отчётов в CSV (team-metrics, team-MRs, dept-DORA, audit)                                      | ✅ 95% |
| FR-13 | Сигналы аномалий (устойчивые отклонения без раскрытия индивидуальных значений)                       | 🔴 Backend `getTeamAnomalies` — stub `notImplemented`. UI не реализован. |
| FR-14 | Доступ разработчика к истории собственных показателей за весь период наблюдения                       | 🟡 80% — реализована team-level история (`/me/metrics/history`); персональные snapshot'ы ещё не пишутся (`entityType='user'`). UI `/me/history` готов. |

### Could have (C)

| FR    | Требование                                                                                       | Статус |
| ----- | ------------------------------------------------------------------------------------------------ | ------ |
| FR-15 | MR Size — распределение по бакетам (≤50, 51–200, 201–400, 401–800, >800 строк)                  | ✅ 95% |

### Won't have (W) — за пределами MVP ВКР

| FR    | Требование                                                                                       | Причина |
| ----- | ------------------------------------------------------------------------------------------------ | ------- |
| FR-16 | Failed Deployment Recovery Time (FDRT) — время восстановления после неудачного развёртывания     | Требует интеграции с системой мониторинга (Prometheus / Grafana / Sentry). |
| FR-17 | Deployment Rework Rate — доля незапланированных деплоев в ответ на инциденты                     | Требует системы инцидент-менеджмента (PagerDuty / Opsgenie).             |
| FR-18 | Workload Distribution (коэффициент Джини по активности участников)                                | Метрика активности per-author — конфликт с законом Гудхарта (см. ниже).  |
| FR-19 | Knowledge Sharing Index — граф обмена знаниями между участниками                                  | Требует анализа sentiment ревью + сложной визуализации графа. Отложено.  |

---

## Ролевая модель видимости данных (ВКР 2.1.5, Таблица 7)

| Роль        | Видит                                                                                                                                | НЕ видит                                                            |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| `DEVELOPER` | Свои индивидуальные метрики; командные агрегаты команд, в которых состоит, для baseline; история своих показателей                  | Индивидуальные метрики других участников (даже агрегированные)      |
| `LEAD`      | Командные агрегаты команд, где per-team role = `LEAD`; Cycle Time MR с декомпозицией; MR Size; Bus Factor; сигналы аномалий          | Индивидуальные значения метрик участников; данные других команд     |
| `HEAD`      | Кросс-командные **DORA** (Lead Time, DF, CFR) по командам своего отдела; сравнительная динамика во времени                          | Индивидуальные данные; review-метрики уровня MR (CT MR, MR Size)    |
| `ADMIN`     | Управление: GitLab-подключения, проекты, команды, отделы, пользователи, журнал аудита                                                | **Содержательные значения метрик** на любом уровне агрегации        |

**Архитектурная гарантия**: попытка доступа к данным вне scope → **HTTP 403** на уровне сервиса. **Никогда** не маскируется на фронте через CSS/conditional rendering — данные физически не доходят до клиента.

### Различение «глобальная роль» vs «per-team роль»

В системе **две независимых роли**:

| Поле                  | Где живёт              | Управляет                                                                                  |
| --------------------- | ---------------------- | ------------------------------------------------------------------------------------------ |
| `users.role`          | Глобальная (в JWT)     | Меню UI: какие разделы видит юзер (`/admin/*` для ADMIN, `/department/*` для HEAD, и т.д.) |
| `team_members.role`   | Per-team               | Доступ к метрикам **конкретной** команды как LEAD (vs DEVELOPER-member)                    |

Глобальный LEAD без `team_members.role='LEAD'` для команды X получит **403** на `/teams/X/cycle-time-mr`. Это сделано намеренно: человек может быть LEAD'ом команды A и DEVELOPER-member в команде B одновременно.

---

## Матрица доступа REST API (ВКР 2.2.7, Таблица 9)

`+1` — доступ только в пределах своей команды.
`+2` — доступ только в пределах команд, где per-team role = LEAD.

| Endpoint                                   | Метод    | DEV  | LEAD | HEAD | ADMIN |
| ------------------------------------------ | -------- | ---- | ---- | ---- | ----- |
| `/api/auth/login`, `/register`             | POST     | +    | +    | +    | +     |
| `/api/me`, `/me/metrics`, `/me/history`    | GET      | +    | +    | +    | —     |
| `/api/teams`                               | GET      | +1   | +2   | +    | +     |
| `/api/teams/:uid/metrics`                  | GET      | +1   | +2   | +    | +     |
| `/api/teams/:uid/cycle-time-mr`            | GET      | —    | +2   | —    | +     |
| `/api/teams/:uid/mr-size`                  | GET      | —    | +2   | —    | +     |
| `/api/teams/:uid/lead-time`                | GET      | —    | +2   | +    | +     |
| `/api/teams/:uid/deployment-frequency`     | GET      | —    | +2   | +    | +     |
| `/api/teams/:uid/change-failure-rate`      | GET      | —    | +2   | +    | +     |
| `/api/teams/:uid/bus-factor`               | GET      | —    | +2   | +    | +     |
| `/api/teams/:uid/anomalies`                | GET      | —    | +2   | —    | —     |
| `/api/teams/:uid/snapshots/latest|history` | GET      | —    | +2   | + *  | +     |
| `/api/dora/cross-team`                     | GET      | —    | —    | +    | +     |
| `/api/export/teams/:uid/*`                 | GET      | +1   | +2   | +    | +     |
| `/api/export/departments/:uid/dora`        | GET      | —    | —    | +    | +     |
| `/api/admin/*` (gitlab, projects, teams, users, departments, sync, audit) | * | — | — | — | +     |

`* HEAD на snapshots: получает 403 при `metricType=cycle_time_mr|mr_size` (см. `assertMetricAccessibleForRole` в `snapshot.service`).

Single source of truth: `back/src/middleware/role-matrix.ts` (`TEAM_METRIC_ACCESS`, `HEAD_FORBIDDEN_METRICS`, `canViewTeamMetric`).

---

## Метрики системы

### Метрики потока поставки (DORA, ВКР 2.1.3)

**Lead Time for Changes** (FR-04):

```
LT(deploy, MR) = deployedAt − MIN(commits.committedAt for c in mr_commits)
```

Отображается медиана и p90. MVP-семантика: «first commit of MR» (не branch-level — упрощение, см. `ДОРАБОТКИ §2.3`).

**Deployment Frequency** (FR-04):

```
DF = count(successful_deploys) / period
```

Категоризация DORA (пороги CherryGit):

| Категория | Условие        |
| --------- | -------------- |
| `elite`   | perDay > 1     |
| `high`    | perDay ≥ 1/7   |
| `medium`  | perDay ≥ 1/30  |
| `low`     | perDay < 1/30  |

**Change Failure Rate** (FR-04, парная с DF):

```
CFR = count(deploys с isHotfix OR isRevert) / count(all_deploys) × 100%
```

Категоризация:

| Категория | Условие              |
| --------- | -------------------- |
| `elite`   | rate ≤ 15%           |
| `high`    | rate ≤ 30%           |
| `medium`  | rate ≤ 45%           |
| `low`     | rate > 45%           |
| `null`    | totalDeploys = 0     |

**MVP-семантика «fix-deploy»** (намеренное упрощение, см. `ДОРАБОТКИ §1.4`): помечается _fix_-deploy (тот, что содержит hotfix-MR), а не _broken_-deploy. Каноническая DORA требует инцидент-менеджмента (вне MVP).

### Метрики код-ревью (ВКР 2.1.3)

**Cycle Time MR с декомпозицией** (FR-09):

```
totalCycle               = mergedAt − gitlabCreatedAt
timeToFirstReview        = firstReviewAt − gitlabCreatedAt
timeInReview             = approvedAt − firstReviewAt
timeToMergeAfterApproval = mergedAt − approvedAt
```

Драфт-фильтр: `^\s*(draft|wip)\b\s*[:\-]` (case-insensitive); отбрасывает «Draft: ...» и «WIP:» из выборки.

**MR Size** (FR-15) — распределение MR по бакетам:

| Бакет          | Условие          |
| -------------- | ---------------- |
| `≤50`          | linesChanged ≤ 50      |
| `51–200`       | 51 ≤ linesChanged ≤ 200 |
| `201–400`      | 201 ≤ linesChanged ≤ 400 |
| `401–800`      | 401 ≤ linesChanged ≤ 800 |
| `>800`         | linesChanged > 800       |

`size(mr) = linesAdded + linesRemoved`. MR Size и Cycle Time MR считаются по одной выборке (тот же draft-фильтр), чтобы sampleSize совпадал при парной визуализации.

### Метрики устойчивости команды (ВКР 2.1.3)

**Bus Factor по модулям** (FR-10):

```
BF(module) = count(distinct_authors с merged MR, изменившими файл модуля за окно 90 дней)
```

Цветовая разметка: `red` (1 автор) / `yellow` (2) / `green` (≥3).

Модули определяются двумя способами:

1. **Explicit**: запись в `code_modules.pathPattern` (glob), задаётся ADMIN'ом для каждого проекта.
2. **Implicit fallback**: первая директория пути файла (`src/auth/foo.ts` → `auth`); файлы в корне → `<root>`.

`overallBusFactor` = min по модулям с активностью; `null` если активности нет.

---

## Принципы CherryGit (нельзя нарушать)

Согласовано с CLAUDE.md (предыдущая версия) + ВКР 1.2 + закон Гудхарта:

1. **Метрики измеряют процесс, не людей.** Индивидуальные показатели приватны архитектурно (нет API, отдающего чужие индивидуальные значения LEAD/HEAD'у).
2. **Outcome важнее activity.** Не «коммитов на разработчика» или «строк кода», а «время от идеи до продакшена», «доля провальных деплоев», «концентрация знаний».
3. **Парная визуализация** (FR-06). Метрика скорости **всегда** отображается рядом с метрикой качества: DF + CFR, Cycle Time MR + MR Size. Эндпоинты разделены, но временная шкала бакетов синхронизирована (`bucketKey` общая функция).
4. **Прозрачность расчёта** (FR-11). Формула каждой метрики + `sampleSize` + `excludedDrafts` + `projectUids` доступны в UI через раскрывающийся блок.

### Намеренно исключённые метрики (никогда не добавлять)

Закон Гудхарта применяется как **методологический ограничитель** (ВКР 1.2.3):

- ❌ Количество коммитов на разработчика — стимулирует искусственное дробление.
- ❌ Lines of Code на разработчика — наказывает рефакторинг и удаление кода.
- ❌ Story Points в управленческих дашбордах — стимулирует фиктивное дробление задач.
- ❌ Индивидуальные дашборды участников для тимлида или руководителя.
- ❌ FR-18 (Workload Distribution / коэффициент Джини per-author) — попадает под тот же запрет; отнесён к Won't have осознанно.

---

## Информационная модель данных

### Доменные сущности ВКР (раздел 3.5.2, Таблица 15)

| Сущность           | Назначение                                                                                                  |
| ------------------ | ----------------------------------------------------------------------------------------------------------- |
| `User`             | Учётная запись пользователя системы (id, имя, mail, hash пароля, роль, departmentUid)                      |
| `Team`             | Команда разработки                                                                                          |
| `TeamMember`       | Ассоциативная сущность User ↔ Team с per-team role и `joinedAt`                                            |
| `Project`          | Подключённый GitLab-проект (gitlabConnection, gitlabProjectId, releaseTagPattern, hotfix/revert labels)    |
| `SyncStatus`       | Состояние последней синхронизации проекта (lastSyncAt, lastCommitSha, lastMrIid, status, errorMessage)     |
| `Commit`           | Извлечённый из GitLab коммит (sha, message, committedAt, files, authorUid, authorGitlabUsername)           |
| `MergeRequest`     | MR с временными метками фаз (firstReviewAt, approvedAt, mergedAt), размером, метками hotfix/revert         |
| `Review`           | Акт ревью (state, reviewedAt, reviewerUid, reviewerGitlabUsername)                                          |
| `Deployment`       | Тег-релиз (tag, deployedAt, commitSha, isHotfix, isRevert, isFailed)                                       |
| `AuditLog`         | Запись журнала аудита (userUid, action, entityType, entityId, details JSONB, occurredAt)                   |
| `MetricSnapshot`   | Сохранённое значение метрики (metricType, entityType, entityId, periodStart, periodEnd, value JSONB)       |

### Полный перечень таблиц в БД (Drizzle schema)

`back/src/db/drizzle/schema/`:

| Схема              | Таблицы                                                                                                              |
| ------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `user/`            | `users`, `userProfle` *(опечатка не исправлена, см. ДОРАБОТКИ 9.2.10)*                                              |
| `departments/`     | `departments`                                                                                                        |
| `teams/`           | `teams`, `teamMembers`, `teamProjects`                                                                               |
| `gitlab/`          | `gitlabConnections`, `userGitlabIdentities`, `projects`, `syncStatuses`, `codeModules`, `gitlabRawPayloads`, `gitlabAvailableProjects`, `gitlabUsers`, `projectGitlabUsers` |
| `git-data/`        | `commits`, `mergeRequests`, `mrCommits`, `mrReviews`, `deployments`, `deploymentMergeRequests`                       |
| `metrics/`         | `metricsSnapshots`, `auditLogs`, `anomalySignals`                                                                    |

`baseSchema` (общая шапка): `uid uuid PRIMARY KEY DEFAULT gen_random_uuid()`, `createdAt timestamp DEFAULT now()`, `updatedAt timestamp`.

---

## Структура бэкенда

### `back/src/`

```
config/
  ├── env.ts                    — Zod-валидация env-переменных
  └── index.ts                  — Сводный config object (app, cors, database, jwt, sync, encryption)
db/
  ├── drizzle/
  │   ├── connect.ts            — Пул подключений
  │   ├── migrate.ts, seed.ts   — Применение миграций; seed первого ADMIN'а
  │   ├── migrations/           — SQL-миграции (drizzle-kit)
  │   └── schema/               — См. выше
  └── redis/                    — Redis-клиент (refresh-токены + rate-limit)
lib/
  ├── encryption.ts             — AES-256-GCM для PAT-токенов GitLab (ВКР 2.2.3)
  ├── glob-match.ts             — Самописный glob (для releaseTagPattern и code_modules.pathPattern)
  ├── ip-rate-limiter.ts        — Брутфорс-защита login по IP через Redis
  ├── loger.ts                  — Winston + morgan stream
  ├── reponse.ts                — Унифицированный sendResponse(res, status, data)
  ├── request-params.ts         — Type-safe req.params/query/body extraction
  └── statistics.ts             — median, quantile, p90 (R-7 интерполяция)
middleware/
  ├── auth.middleware.ts        — isAuthenticated + auto-refresh access-токена
  ├── role.middleware.ts        — requireRole(...roles)
  ├── role-matrix.ts            — TEAM_METRIC_ACCESS + canViewTeamMetric (single source of truth)
  ├── team-access.middleware.ts — requireTeamAccess(paramName)
  └── self-or-admin.middleware.ts — requireSelfOrAdmin(paramName)
modules/
  ├── main.router.ts            — Корневой роутер: /auth, /user, /me, /teams, /dora, /export, /admin
  ├── auth/                     — POST /register, /login, /logout (+ JWT-service, refresh)
  ├── user/                     — GET /profile (legacy шаблон)
  ├── me/                       — GET /me, /me/access, /me/metrics, /me/metrics/history, /me/gitlab-identities
  ├── teams/                    — GET /teams, /teams/:uid (user-facing) + admin /teams/* + nested /teams/:uid/metrics/*
  ├── dora/                     — GET /dora/cross-team, /dora/cross-team/trend (HEAD/ADMIN only)
  ├── export/                   — GET /export/teams/:uid/metrics, /merge-requests; /export/departments/:uid/dora
  ├── metrics/                  — Калькуляторы (compute-team, cycle-time-mr, mr-size, lead-time, deployment-frequency, change-failure-rate, bus-factor) + сервисы + routes
  ├── snapshots/                — Writer + reader для metrics_snapshots; routes /teams/:uid/snapshots/latest|history
  ├── sync/                     — Инкрементальный sync GitLab + node-cron scheduler
  ├── projects/                 — Управление подключёнными GitLab-проектами + code-modules
  ├── gitlab/                   — GitLab API клиент + discovery service + admin routes
  ├── departments/              — CRUD отделов, attach/detach команд, assign/unassign HEAD'ов
  ├── users-admin/              — Admin CRUD пользователей + linkGitlabIdentity + reconcile + provisioning
  ├── audit/                    — recordAuditLog + listAuditLogs (с фильтрами, JOIN, pagination, stats)
  └── admin/                    — Композитор admin-роутов под /api/admin/*
types/
  └── express/index.d.ts        — req.user, req.teamAccess (extension)
utils/
  ├── custom_error.ts           — class CustomError extends Error { statusCode }
  ├── encryption.ts             — Хелперы шифрования (используется в lib/encryption)
  └── enums/                    — ErrorMessage, HttpStatus
main.ts                         — Bootstrap (security headers, cors, router, error handlers, scheduler)
swagger.json                    — OpenAPI 2.0
```

### Сводка REST API (top-level)

| Префикс           | Содержимое                                                                                                       |
| ----------------- | ---------------------------------------------------------------------------------------------------------------- |
| `/api/auth`       | `POST /register`, `POST /login`, `POST /logout`                                                                  |
| `/api/user`       | `GET /profile` (legacy)                                                                                          |
| `/api/me`         | `GET /`, `GET /access`, `GET /metrics`, `GET /metrics/history`, `GET /gitlab-identities`                         |
| `/api/teams`      | `GET /`, `GET /:uid`, **+ nested** `/:teamUid/metrics`, `/cycle-time-mr`, `/mr-size`, `/lead-time`, `/deployment-frequency`, `/change-failure-rate`, `/bus-factor`, `/anomalies`, `/snapshots/latest|history` |
| `/api/dora`       | `GET /cross-team`, `GET /cross-team/trend` (HEAD/ADMIN)                                                          |
| `/api/export`     | `GET /teams/:uid/metrics`, `/teams/:uid/merge-requests`, `/departments/:uid/dora`                                |
| `/api/admin`      | `/gitlab`, `/gitlab-users`, `/projects`, `/teams` (+ nested members/projects), `/users`, `/departments`, `/sync`, `/audit` |
| `/docs`           | Swagger UI (см. `ДОРАБОТКИ 9.2.14` — для прода скрыть)                                                          |

Auth — JWT в httpOnly-cookies (`{APPNAME}-access-token`, `{APPNAME}-refresh-token`). Middleware автоматически обновляет access-токен через refresh из Redis.

---

## Структура фронтенда

### `front/src/`

```
main.tsx                        — Точка входа + QueryClientProvider
router.tsx                      — createBrowserRouter с защищёнными маршрутами
index.css                       — Глобальные Tailwind стили
pages/
  ├── auth/
  │   ├── login/                — Форма логина (react-hook-form + zod)
  │   └── register/             — Форма регистрации (DEVELOPER по умолчанию)
  ├── dashboard/                — DashboardRedirect: по роли → /me, /teams, /department/dora или /admin/users
  ├── me/                       — Дашборд разработчика (Cycle Time MR + MR Size + командный baseline)
  │   ├── index.tsx, history.tsx (страница «История метрик»)
  │   └── components/           — CycleTimeMrCard, MrSizeCard, PeriodSelector
  ├── teams/                    — Дашборд тимлида: вкладки «Метрики» / «DORA» / «Bus Factor»
  │   └── components/           — TeamCycleTimeMrCard, TeamMrSizeCard, TeamDoraPanel, BusFactorTable, TeamSelector
  ├── department/
  │   ├── dora/                 — Кросс-командные DORA-метрики (HEAD)
  │   └── trend/                — Динамика метрик во времени (HEAD)
  └── admin/                    — gitlab, projects, teams (+ candidates from GitLab, project-attach), departments, gitlab-users, users, sync, audit
shared/
  ├── api/                      — Axios-инстанс + per-module API helpers (admin, me, teams, dora)
  ├── contexts/                 — AuthProvider
  ├── hooks/                    — useAuth
  ├── components/               — ProtectedRoute (с роль-гардом)
  ├── constants/routes.ts       — Типизированный ROUTES (класс Routes)
  ├── lib/                      — utils (cn = clsx + tailwind-merge), format (formatSeconds, ...)
  ├── layouts/AppLayout.tsx     — Боковая навигация + ролевые пункты меню
  ├── types/index.ts            — Общие TS-типы (AdminUser, MetricSnapshot, MyMetricsReport, ...)
  └── ui/                       — shadcn-style компоненты (Button, Card, Badge, Alert, Input, FormulaBlock, ...)
```

### Path aliases

| Alias        | Путь            |
| ------------ | --------------- |
| `@pages/*`   | `src/pages/*`   |
| `@shared/*`  | `src/shared/*`  |

### Ключевые маршруты

| Константа                  | Путь                              |
| -------------------------- | --------------------------------- |
| `ROUTES.login/register`    | `/login`, `/register`             |
| `ROUTES.dashboard`         | `/dashboard` (редирект по роли)   |
| `ROUTES.developer.root`    | `/me`                             |
| `ROUTES.developer.history` | `/me/history`                     |
| `ROUTES.lead.team(uid)`    | `/teams/:teamUid`                 |
| `ROUTES.head.dora/trend`   | `/department/dora`, `/department/trend` |
| `ROUTES.admin.*`           | `/admin/users`, `/admin/teams`, `/admin/projects`, …  |

### MCP-серверы фронтенда (`.mcp.json`)

- **shadcn** — `npx shadcn@latest mcp` — добавление UI-компонентов прямо из Claude Code.
- **context7** — `npx -y @upstash/context7-mcp@latest` — актуальная документация по React, Vite, Tailwind, React Router (использовать вместо обучающих данных).

---

## Переменные окружения

### Бэкенд (`back/example.env`)

| Переменная                                                | Назначение                                                                       |
| --------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `APPNAME`                                                 | Префикс имён cookie (`{APPNAME}-access-token`, ...)                              |
| `PORT`                                                    | HTTP-порт (default 8080)                                                         |
| `NODE_ENV`                                                | `prod` / `dev`                                                                   |
| `LOCALE`                                                  | `true` для локального dev (swagger host = localhost)                             |
| `PRODUCTION_URL`                                          | API-домен в проде (для swagger host)                                             |
| `CLIENT_BASE_URL`                                         | CORS origin фронтенда (`http://localhost:5173` в dev)                            |
| `DATABASE_HOST/PORT/USER/PASSWORD/NAME`                   | PostgreSQL подключение                                                           |
| `DATABASE_URL`                                            | `postgresql://...` (Drizzle использует напрямую)                                |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`                | Секреты JWT                                                                      |
| `ACCESS_TOKEN_EXPIRES_IN`                                 | TTL access (`15m`)                                                               |
| `REFRESH_TOKEN_EXPIRES_IN`                                | TTL refresh (`168h` = 7 дней). Поддерживает `s/m/h/d` (см. ДОРАБОТКИ 9.2.7)     |
| `REDIS_HOST / REDIS_PORT / REDIS_PASSWORD`                | Redis                                                                            |
| **`TOKEN_ENCRYPTION_KEY`**                                | **AES-256 ключ (64 hex символа = 32 байта) для шифрования PAT-токенов GitLab. Генерация: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`** |
| `LOGIN_RATE_LIMITER_ATTEMPTS / TIMER_M`                   | Брутфорс-защита login                                                            |
| `SYNC_INTERVAL_M`                                         | Период sync-планировщика в минутах (default 10). Используется, если не задан `SYNC_CRON` (конвертируется в `*/N * * * *`) |
| `SYNC_CRON`                                               | cron-выражение расписания sync (node-cron, 5 полей). Приоритетнее `SYNC_INTERVAL_M`. Пример: `0 9-18 * * 1-5` |
| `SYNC_RUN_ON_START`                                       | `true` — первый sync-tick при старте приложения                                  |
| `SEED_ADMIN_MAIL / PASSWORD / FIRST / LAST`               | Опционально для `yarn seed` (default `admin@cherrygit.local` / `Admin1234!`)    |

### Фронтенд (`front/.env`)

| Переменная       | Назначение                                          |
| ---------------- | --------------------------------------------------- |
| `VITE_API_URL`   | Базовый URL API (default `http://localhost:8080`)  |

---

## Команды разработки

### Бэкенд (`back/`)

```bash
yarn dev          # dev-режим (ts-node-dev + tsconfig-paths)
yarn build        # tsc + tsc-alias → dist/
yarn start        # node dist/main.js
yarn migrate      # применить миграции (ts-node src/db/drizzle/migrate.ts)
yarn migrate:prod # node dist/db/drizzle/migrate.js (в Docker)
yarn generate     # drizzle-kit generate (новая миграция из изменений schema)
yarn seed         # ts-node src/db/drizzle/seed.ts (создаёт первого ADMIN, идемпотентно)
yarn seed:prod    # node dist/db/drizzle/seed.js (в Docker)
yarn test         # Jest
yarn test:cov     # Покрытие
yarn pretty       # prettier + eslint --fix
```

### Фронтенд (`front/`)

```bash
npm run dev       # Vite dev-сервер
npm run build     # vite build → dist/
npm run preview   # vite preview
npm run lint      # ESLint
npm run format    # Prettier
npm run typecheck # tsc --noEmit
```

### Docker (полный стек)

```bash
docker compose up --build       # postgres + redis + express-app
# В Dockerfile express-app: команда выполняет migrate:prod → seed:prod → start
```

---

## Развёртывание (ВКР 2.2.6, 3.6.1)

**Минимальная конфигурация** (для команды до 3 проектов):

- 1 контейнер `express-app` (Node 22, ≤2GB RAM)
- 1 контейнер `postgres` (PostgreSQL 15, ≤1GB RAM, 50 GB SSD)
- 1 контейнер `redis` (Redis 7-alpine, ≤512 MB RAM)
- 1 контейнер `nginx` (статика фронта + TLS-терминация + проксирование `/api`) — в prod-сборке

**Типовая конфигурация** (до 50 разработчиков / 10 команд) — отдельные физ. сервера для приложения, БД, веба (см. ВКР Таблица 8).

---

## Допущения MVP

- Деплои определяются по **тегам репозитория GitLab** с настраиваемым glob-паттерном (default `v*`).
- Хотфиксы и откаты определяются по **меткам merge-request'ов** (default `{hotfix, rollback}` и `{revert}`). Не по анализу commit message.
- Команды — **явные группы пользователей** с привязкой к проектам GitLab; динамическое определение по активности не реализуется.
- Авторизация к GitLab — через **Personal Access Token** (PAT), шифруется AES-256 в БД.
- Лимит периода для дашбордов — 30 / 90 / 180 дней (UI), 90 дней для Bus Factor (концептуальное окно).
- Snapshot writer пишет **один snapshot на (метрика, команда, день UTC)** — повторные tick'и в течение дня апсёртят ту же строку.

---

## Дашборды (что показывает UI)

### Developer (`/me`)

- Личные **Cycle Time MR** + **MR Size** за выбранный период (Personal vs командный baseline).
- Декомпозиция Cycle Time по фазам (✓ / ↑ / ↓ vs baseline).
- История на `/me/history` (sparkline'ы Cycle Time MR median/p90 и MR Size median по командам).

### Lead (`/teams/:teamUid`)

Три вкладки:

- **«Метрики»** — Cycle Time MR с декомпозицией + MR Size (бакеты + median/p90).
- **«DORA»** — Lead Time (median/p90) + парная визуализация DF↔CFR с категориями (Elite/High/Medium/Low) и timeline-bar'ами.
- **«Bus Factor»** — таблица модулей с цветовой маркировкой риска и списком авторов.

### Head (`/department/dora`, `/department/trend`)

- DORA-метрики по командам отдела + сравнительная таблица + блок инсайтов (лучший LT, наибольший DF, наименьший CFR).
- Динамика метрик во времени (timeline).

### Admin (`/admin/*`)

- CRUD: GitLab connections / Projects / Teams (с участниками + GitLab-кандидатами + привязкой проектов) / Departments / Users / GitLab Users.
- Sync-monitor (статус по проектам, ручной trigger, ручной recalculate).
- Audit log с фильтрами и экспортом.

---

## Теоретическая основа (для контекста)

### DORA (DevOps Research and Assessment, актуальная редакция)

5 метрик в двух группах:

- **Throughput**: Change Lead Time, Deployment Frequency, **Failed Deployment Recovery Time** (W).
- **Instability**: Change Fail Rate, **Deployment Rework Rate** (W).

(W) — вне MVP, требует интеграции с системой мониторинга / инцидент-менеджмента.

### SPACE (Microsoft/GitHub, 2021)

5 измерений, каждое — самостоятельный аспект продуктивности:

- **S** — Satisfaction (опросы, вне автосбора).
- **P** — Performance (Change Failure Rate, Reopen Rate).
- **A** — Activity (MR Size, Deployment Frequency — **всегда в паре с качеством**, иначе закон Гудхарта).
- **C** — Communication (Knowledge Sharing Index W, Bus Factor).
- **E** — Efficiency/Flow (Lead Time, Cycle Time MR).

### Закон Гудхарта

> Метрика, ставшая KPI для оценки сотрудника, перестаёт быть достоверным показателем процесса.

Применяется в CherryGit как **ограничитель**: индивидуальные метрики приватны архитектурно. Никакая метрика активности per-author не доходит до управленческой роли через API.

---

## Диаграммы

| Диаграмма                          | Расположение                                     |
| ---------------------------------- | ------------------------------------------------ |
| Use Case (ВКР рис. 1)              | `use-case.png`                                   |
| Диаграмма классов (ВКР рис. 5)     | `class-diagram/class-diagram.png` и `.svg`       |
| Диаграмма развёртывания (ВКР рис. 6) | `Диаграмма развертывания/диаграмма.png` и `.svg` |
| User Flow (ВКР рис. 7)             | `User Flow/user_flow.svg`                        |
| BPMN: Основной процесс (рис. 2)    | `BPMN/Основной процесс/`                         |
| BPMN: Подключение проекта (рис. 3) | `BPMN/Подключение проекта/`                      |
| BPMN: Просмотр командного дашборда (рис. 4) | `BPMN/Просмотр командного дашборда/`     |

**Не редактировать** без необходимости — диаграммы вшиты в текст ВКР как иллюстрации.

---

## Шаблоны взаимодействия

- При вопросах по GitLab API — справочник: https://docs.gitlab.com/api/api_resources/
- При неясных требованиях ВКР — **искать в `_vkr.txt`** через grep (894 строки plain-text); вторично — спросить пользователя.
- При расхождении кода и `CLAUDE.md` / `ДОРАБОТКИ.md` — **код — источник истины**, документы обновлять.
- Все мутации должны писать **audit** через `recordAuditLog` (раздел `ДОРАБОТКИ §5`).
- Все эндпоинты должны проходить через **двухступенчатую защиту** (`requireRole` route-level + `assertTeamAccess` service-level).
