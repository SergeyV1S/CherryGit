# CLAUDE.md — CherryGit (ВКР)

## Что такое CherryGit

**CherryGit** — информационная система диагностики процессов разработки ПО на основе анализа данных Git-репозиториев. Интегрируется с GitLab (self-hosted и cloud), собирает данные о коммитах, merge requests, ревью и релизах, рассчитывает метрики по моделям DORA и SPACE, отображает результаты в ролевых дашбордах.

**Главный тезис:** система отвечает на вопрос «как помочь команде увидеть свой процесс?», а не «как измерить каждого сотрудника». Это выражено архитектурно — через ролевую сегрегацию данных на уровне REST API.

**Документы проекта:**

- `ВКР_ЯЦУК_CHERRYGIT.docx` — текст дипломной работы
- `CherryGit_концепция_v2.pdf` — полное описание идеи, метрик, ролевой модели (первичный источник истины по концепции)
- `План_содержания_ВКР_CherryGit.docx` — план содержания ВКР

---

## Структура репозитория

```
Диплом/
├── CLAUDE.md                          # этот файл
├── ВКР_ЯЦУК_CHERRYGIT.docx           # текст дипломной работы
├── CherryGit_концепция_v2.pdf         # концепция системы (основной источник)
├── План_содержания_ВКР_CherryGit.docx
├── front/                             # React-фронтенд
├── back/                              # Express-бэкенд
├── BPMN/                              # BPMN-диаграммы процессов
│   ├── Основной процесс/
│   ├── Подключение проекта/
│   └── Просмотр командного дашборда/
├── User Flow/
│   └── user_flow.svg
├── class-diagram/
│   ├── class-diagram.png/.svg
│   └── code.txt
├── Диаграмма развертывания/
│   └── диаграмма.png/.svg
└── use-case.png
```

---

## Фронтенд (`front/`)

### Стек

| Технология     | Версия | Назначение                                   |
| -------------- | ------ | -------------------------------------------- |
| React          | 19     | UI-фреймворк                                 |
| TypeScript     | 6      | Типизация                                    |
| Vite           | 8      | Сборка                                       |
| React Compiler | —      | Автомемоизация (babel-plugin-react-compiler) |
| React Router   | 7      | Маршрутизация (`createBrowserRouter`)        |
| Tailwind CSS   | 4      | Стилизация                                   |
| shadcn/ui      | —      | UI-компоненты (radix-ui + cva)               |
| Axios          | —      | HTTP-клиент                                  |
| Zod            | —      | Валидация данных                             |

### Структура `front/src/`

```
src/
├── main.tsx               # Точка входа
├── router.tsx             # Конфигурация маршрутов
├── index.css              # Глобальные стили (Tailwind)
├── pages/
│   └── example/           # Шаблон страницы
│       ├── index.tsx
│       └── components/example.tsx
└── shared/
    ├── api/
    │   └── instance.ts    # Axios-инстанс (baseURL из process.env.API_URL)
    ├── constants/
    │   ├── index.ts
    │   └── routes.ts      # Типизированный объект ROUTES (класс Routes)
    ├── lib/
    │   └── utils.ts       # cn() — clsx + tailwind-merge
    ├── ui/
    │   ├── index.ts
    │   ├── button.tsx
    │   └── typography.tsx
    └── utils/
        ├── index.ts
        ├── clsx.ts
        ├── createRoute.tsx # createRoute() — оборачивает компонент в Suspense
        └── eventBus.ts    # Типизированная шина событий
```

### Path aliases

| Alias       | Путь           |
| ----------- | -------------- |
| `@pages/*`  | `src/pages/*`  |
| `@shared/*` | `src/shared/*` |

### Маршруты

Определены в `src/shared/constants/routes.ts` через класс `Routes`:

| Константа      | Путь     |
| -------------- | -------- |
| `ROUTES.index` | `/`      |
| `ROUTES.chats` | `/chats` |

Новый маршрут: `createRoute(ROUTES.path, <Component />)` → зарегистрировать в `src/router.tsx`.

### EventBus

```ts
bus.$on("open-main-sidebar", handler);
bus.$emit("open-main-sidebar", payload);
bus.$off("open-main-sidebar", handler);
```

### Команды фронтенда

```bash
npm run dev       # dev-сервер
npm run build     # продакшн-сборка
npm run preview   # предпросмотр
npm run lint      # ESLint
npm run format    # Prettier
npm run typecheck # tsc без эмита
```

### Соглашения фронтенда

- Компоненты страниц — `src/pages/<name>/index.tsx`, подкомпоненты — `src/pages/<name>/components/`
- Переиспользуемые UI — `src/shared/ui/`
- Все экспорты через barrel-файлы `index.ts`
- Страницы загружаются лениво (`React.lazy`) через `createRoute`

### MCP-серверы фронтенда (`.mcp.json`)

**shadcn** — `npx shadcn@latest mcp` — добавление UI-компонентов прямо из Claude Code.

**context7** — `npx -y @upstash/context7-mcp@latest` — актуальная документация по React, Vite, Tailwind, React Router. Использовать через `mcp__context7__query-docs` вместо обучающих данных.

---

## Бэкенд (`back/`)

### Стек

| Технология                   | Назначение                              |
| ---------------------------- | --------------------------------------- |
| Express.js + TypeScript      | REST API                                |
| Drizzle ORM                  | ORM + миграции                          |
| PostgreSQL                   | Основная БД                             |
| Redis                        | Хранение refresh-токенов, rate limiting |
| AWS S3-совместимое хранилище | Файлы/изображения                       |
| Nodemailer + Handlebars      | Email-рассылки                          |
| Winston                      | Логирование                             |
| Zod                          | Валидация env и DTO                     |
| Jest                         | Тесты                                   |

### Структура `back/src/`

```
src/
├── config/
│   ├── index.ts              # Единый конфиг (app, cors, database, jwt, bucket, mail)
│   └── env.ts                # Zod-валидация env-переменных
├── db/
│   ├── drizzle/
│   │   ├── connect.ts        # Подключение к PostgreSQL
│   │   ├── drizzle.config.ts # drizzle-kit конфиг
│   │   ├── migrate.ts        # Применение миграций
│   │   ├── migrations/       # SQL-миграции (авто-генерация)
│   │   └── schema/
│   │       ├── base.schema.ts        # uid (uuid PK), createdAt, updatedAt
│   │       ├── user/
│   │       │   ├── schema.ts         # Таблицы: users, user_profile
│   │       │   ├── realtion.ts       # Drizzle relations
│   │       │   └── types/role.type.ts # RoleType: 'USER' | 'ADMIN' | ...
│   │       └── media/
│   │           ├── schema.ts         # Таблицы: files, images (+ ThumbnailImage)
│   │           └── relation.ts
│   └── redis/
│       └── index.ts          # Redis-клиент
├── lib/
│   ├── generate_code.ts      # Генерация кодов верификации
│   ├── ip-rate-limiter.ts    # Rate-limiter через Redis
│   ├── loger.ts              # Winston-логгер + LoggerStream для morgan
│   └── reponse.ts            # sendResponse(res, status, data)
├── middleware/
│   ├── auth.middleware.ts    # isAuthenticated: проверка access-токена, auto-refresh
│   └── lib/
│       ├── extractAccessTokenFromCookie.ts
│       └── extractRefreshTokenFromCookie.ts
├── modules/
│   ├── main.router.ts        # Корневой роутер: /auth, /user, /uploads
│   ├── auth/                 # POST /register, /login, /logout
│   ├── user/                 # GET /profile
│   ├── media/                # POST /uploads/file (multer, max 5 MB, sharp для превью)
│   └── sender/               # Nodemailer + Handlebars-шаблоны
├── types/
│   └── express/index.d.ts   # Расширение Request: req.user
├── utils/
│   ├── custom_error.ts      # class CustomError extends Error { statusCode }
│   └── enums/               # ErrorMessage, HttpStatus
├── main.ts                  # Bootstrap
└── swagger.json             # OpenAPI 2.0
```

### Существующие API-маршруты

| Method | Path               | Auth | Описание             |
| ------ | ------------------ | ---- | -------------------- |
| POST   | /api/auth/register | —    | Регистрация          |
| POST   | /api/auth/login    | —    | Вход                 |
| POST   | /api/auth/logout   | yes  | Выход                |
| GET    | /api/user/profile  | yes  | Профиль пользователя |
| POST   | /api/uploads/file  | yes  | Загрузка файла       |
| GET    | /docs              | —    | Swagger UI           |

Auth — JWT в httpOnly-cookies (`{APPNAME}-access-token`, `{APPNAME}-refresh-token`). Middleware автоматически обновляет access-токен через refresh из Redis.

### Ключевые архитектурные решения (бэкенд)

- **Токены в Redis**: refresh-токены по ключу `uid:token`. `removeAllTokensByUid` инвалидирует все сессии.
- **Rate limiting**: брутфорс логина через Redis-счётчик. Настраивается через `LOGIN_RATE_LIMITER_ATTEMPTS` и `LOGIN_RATE_LIMITER_TIMER_M`.
- **Media**: файлы в S3-совместимое хранилище, изображения сжимаются через `sharp`.
- **Path aliases**: `@/` → `src/` (tsconfig-paths в dev, tsc-alias в build).
- **Ролевая модель**: нарушения доступа возвращают HTTP 403 на уровне middleware, не маскируются на фронте.

### Переменные окружения (бэкенд)

| Переменная                               | Описание                                      |
| ---------------------------------------- | --------------------------------------------- |
| APPNAME                                  | Имя приложения (используется в именах cookie) |
| PORT                                     | HTTP-порт (default 8080)                      |
| NODE_ENV                                 | `prod` / `dev`                                |
| CLIENT_BASE_URL                          | CORS origin фронтенда                         |
| DATABASE_URL                             | PostgreSQL connection string                  |
| DATABASE_HOST/PORT/USER/PASSWORD/NAME    | PostgreSQL параметры                          |
| JWT_ACCESS_SECRET                        | Секрет access-токена                          |
| JWT_REFRESH_SECRET                       | Секрет refresh-токена                         |
| ACCESS_TOKEN_EXPIRES_IN                  | TTL access-токена (напр. `15m`)               |
| REFRESH_TOKEN_EXPIRES_IN                 | TTL refresh-токена (напр. `7d`)               |
| REDIS_HOST / REDIS_PORT / REDIS_PASSWORD | Redis                                         |
| BUCKET_KEY/SECRET/ENDPOINT/NAME          | S3-совместимое хранилище                      |
| MAIL_HOST/USER/PASSWORD/FROM/PORT        | SMTP для Nodemailer                           |
| LOGIN_RATE_LIMITER_ATTEMPTS              | Кол-во попыток до блокировки                  |
| LOGIN_RATE_LIMITER_TIMER_M               | Время блокировки (мин)                        |

### Команды бэкенда

```bash
yarn dev          # dev-режим (ts-node-dev + tsconfig-paths)
yarn build        # tsc + tsc-alias
yarn start        # dist/main.js
yarn migrate      # применить миграции
yarn generate     # сгенерировать миграцию (drizzle-kit)
yarn test         # Jest
yarn test:cov     # тесты с покрытием
yarn pretty       # prettier + eslint --fix
```

Docker:

```bash
docker compose up   # backend + PostgreSQL + Redis
```

### Код-стайл (бэкенд)

- ESLint: `@siberiacancode/eslint`
- Prettier: `@siberiacancode/prettier`
- Husky pre-commit: lint-staged на `*.ts` / `*.js`
- Не использовать `any` — все DTO валидируются через Zod
- Ошибки через `CustomError(statusCode, message)`

---

## Что нужно разработать (предметная область CherryGit)

Текущий бэкенд — общий шаблон (auth, user, media). Нужно добавить предметные модули CherryGit:

Документация гитлаб - https://docs.gitlab.com/api/api_resources/
Если нет возможности получить информацию из документации нужно спросить пользователя.

### Новые сущности БД (Drizzle schema)

- `gitlab_connections` — подключения к GitLab-инстансам (URL, PAT-токен, статус)
- `projects` — подключённые GitLab-проекты
- `teams` — команды, сгруппированные вокруг проектов
- `team_members` — участники команды с ролями (`DEVELOPER` | `LEAD` | `MANAGER`)
- `commits` — собранные коммиты
- `merge_requests` — merge requests с фазами
- `mr_reviews` — ревью по MR
- `deployments` — деплои (теги GitLab с настраиваемым паттерном)
- `metrics_snapshots` — рассчитанные метрики (периодически пересчитываются)

### Новые API-модули

- `gitlab/` — подключение к GitLab, проверка токена, список проектов
- `sync/` — инкрементальный сбор данных (фоновый cron-джоб)
- `teams/` — управление командами и участниками
- `metrics/` — расчёт и получение метрик (с ролевым доступом)
- `dashboard/` — агрегированные данные для дашбордов по ролям

### Ролевая модель доступа к данным (КРИТИЧНО)

| Роль        | Видит                                                                                             | НЕ видит                                                  |
| ----------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `DEVELOPER` | Свои полные индивидуальные метрики, командный baseline                                            | Метрики других участников                                 |
| `LEAD`      | Командные агрегаты, Cycle Time MR с декомпозицией, анонимизированный граф ревью, сигналы аномалий | Конкретные индивидуальные значения участников             |
| `MANAGER`   | Кросс-командные DORA-метрики, сравнительная динамика команд                                       | Любые индивидуальные данные, данные глубже уровня команды |

**Архитектурная гарантия**: запрос индивидуальных данных другого пользователя → HTTP 403 на уровне middleware (не скрывать на фронте).

---

## Метрики системы

### MVP (реализуется в ВКР)

#### Метрики потока поставки (DORA)

**Lead Time for Changes** — время от первого коммита до деплоя в продакшен.

```
LT = timestamp(deploy_to_prod) − timestamp(first_commit_in_branch)
```

Отображается медиана и 90-й перцентиль.

**Deployment Frequency** — частота деплоев в продакшен.

```
DF = count(successful_deploys) / period
```

Категории: Elite (несколько/день), High (день–неделя), Medium (неделя–месяц), Low (реже).

**Change Failure Rate** — доля деплоев, потребовавших отката/хотфикса.

```
CFR = count(deploys_with_hotfix_or_revert) / count(all_deploys) × 100%
```

Парная метрика к Deployment Frequency — видны всегда вместе.

#### Метрики код-ревью

**Cycle Time MR с декомпозицией** — время жизни MR по фазам:

- Time to first review (открытие → первый комментарий ревьюера)
- Time in review (первое ревью → апрув)
- Time to merge after approval (апрув → мерж)

**MR Size** — распределение MR по размеру (строки / файлы).
Бакеты: ≤50, 51–200, 201–400, 401–800, >800 строк.

#### Метрики команды

**Bus Factor по модулям** — число активных контрибьюторов по каждому модулю за последние 90 дней.

```
BF(module) = count(distinct_authors with commits in last 90 days)
```

### За пределами MVP (не реализуется в ВКР)

- Failed Deployment Recovery Time (требует интеграции с системой мониторинга)
- Deployment Rework Rate (требует системы инцидент-менеджмента)
- Workload Distribution (коэффициент Джини)
- Knowledge Sharing Index (граф «кто кого ревьюит»)
- Review Coverage / Reopen Rate
- Система сигналов аномалий
- Webhook-обновления в реальном времени
- Интеграция с GitHub, Bitbucket

### Принципы метрик (нельзя нарушать)

1. **Метрики измеряют процесс, не людей** — индивидуальные показатели приватны, недоступны руководству.
2. **Outcome важнее activity** — не коммиты/строки кода, а время от идеи до продакшена.
3. **Парная визуализация** — метрика скорости всегда отображается рядом с метрикой качества.
4. **Прозрачность расчёта** — формула каждой метрики доступна прямо в UI (раскрывающийся блок).

### Намеренно исключённые метрики (никогда не добавлять)

- Количество коммитов на разработчика
- Lines of Code на разработчика
- Story Points в управленческих дашбордах
- Индивидуальные дашборды участников для тимлида/руководителя

---

## Допущения MVP

- Деплои определяются по тегам репозитория GitLab с настраиваемым паттерном (например `v*`).
- Хотфиксы и откаты определяются по меткам (labels) merge requests — не по анализу commit message.
- Команды — явные группы пользователей с привязкой к проектам GitLab; динамическое определение по активности не реализуется.
- Авторизация к GitLab — через Personal Access Token.

---

## Дашборды (что показывать в UI)

### Дашборд разработчика

- Личные метрики за выбранный период (Cycle Time MR, MR Size)
- Командный baseline для сравнения
- История своих метрик

### Дашборд тимлида

- Командные агрегаты: Cycle Time MR с декомпозицией, MR Size
- Bus Factor по модулям
- Анонимизированный граф обмена знаниями (в MVP — упрощённо)

### Дашборд руководителя отдела

- DORA-метрики по командам (Lead Time, Deployment Frequency, Change Failure Rate)
- Кросс-командное сравнение
- Динамика метрик во времени

---

## Развёртывание (MVP)

`docker compose up` — три контейнера:

1. `backend` — Express API
2. `postgres` — PostgreSQL
3. `frontend` — статика фронтенда (или отдельный nginx)

Экспорт метрик в CSV — предусмотреть API-эндпоинт.

---

## Диаграммы проекта

Диаграммы используются в тексте ВКР как иллюстрации. **Не редактировать** без необходимости.

| Диаграмма                          | Расположение                                     |
| ---------------------------------- | ------------------------------------------------ |
| Use Case                           | `use-case.png`                                   |
| Диаграмма классов                  | `class-diagram/class-diagram.png` и `.svg`       |
| Диаграмма развёртывания            | `Диаграмма развертывания/диаграмма.png` и `.svg` |
| User Flow                          | `User Flow/user_flow.svg`                        |
| BPMN: Основной процесс             | `BPMN/Основной процесс/`                         |
| BPMN: Подключение проекта          | `BPMN/Подключение проекта/`                      |
| BPMN: Просмотр командного дашборда | `BPMN/Просмотр командного дашборда/`             |

---

## Теоретическая основа (для контекста)

**DORA** (DevOps Research and Assessment) — 5 метрик в актуальной редакции:

- Throughput: Change Lead Time, Deployment Frequency, Failed Deployment Recovery Time
- Instability: Change Fail Rate, Deployment Rework Rate

**SPACE** (Microsoft/GitHub, 2021) — 5 измерений:

- S — Satisfaction (удовлетворённость, опросы — вне автосбора)
- P — Performance (Change Failure Rate, Reopen Rate)
- A — Activity (MR Size, Deployment Frequency — всегда в паре с качеством)
- C — Communication (Review Coverage, Knowledge Sharing Index, Bus Factor)
- E — Efficiency/Flow (Lead Time, Cycle Time MR, FDRT)

**Закон Гудхарта**: метрика, ставшая KPI для оценки сотрудника, перестаёт быть достоверным показателем. Поэтому индивидуальные метрики приватны архитектурно.
