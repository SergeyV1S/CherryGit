import { logger } from '@/lib/loger';
import { CustomError } from '@/utils/custom_error';
import { HttpStatus } from '@/utils/enums/http-status';

import type {
  GitlabApprovalsResponse,
  GitlabCommit,
  GitlabMergeRequest,
  GitlabMergeRequestDiff,
  GitlabNote,
  GitlabProject,
  GitlabTag,
  GitlabUser
} from './types/gitlab-api.types';

/**
 * Клиент GitLab REST API v4 (ВКР 3.5.1: реализация IDataSource).
 *
 * Особенности:
 *  — авторизация через PRIVATE-TOKEN header (PAT);
 *  — автоматическая пагинация offset-based (per_page=100 max);
 *  — таймаут запроса REQUEST_TIMEOUT_MS, чтобы cron-джоб не зависал;
 *  — ограниченное число retry на 429 (MAX_RATE_LIMIT_RETRIES) с уважением
 *    Retry-After / RateLimit-Reset заголовков;
 *  — маппинг HTTP-ошибок GitLab в CustomError CherryGit;
 *  — статус-код HTTP пишется в лог, тело ответа НЕ логируется (ВКР 2.2.3 —
 *    минимизация обработки персональных данных: тела ошибок могут содержать PII).
 *
 * Документация: https://docs.gitlab.com/api/api_resources/
 */
export class GitlabClient {
  private readonly apiRoot: string;
  private static readonly PER_PAGE = 100;
  /** Защита от бесконечной пагинации при некорректных заголовках GitLab. */
  private static readonly MAX_PAGES = 1000;
  /** Таймаут одного HTTP-запроса. */
  private static readonly REQUEST_TIMEOUT_MS = 30_000;
  /** Максимум попыток повторить запрос при 429. */
  private static readonly MAX_RATE_LIMIT_RETRIES = 5;
  /** Верхняя граница ожидания между retry, чтобы не висеть часами. */
  private static readonly MAX_BACKOFF_MS = 60_000;

  constructor(
    baseUrl: string,
    private readonly token: string
  ) {
    this.apiRoot = `${baseUrl.replace(/\/+$/, '')}/api/v4`;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /** Проверить валидность токена. Возвращает аккаунт владельца токена. */
  async ping(): Promise<GitlabUser> {
    return this.requestJson<GitlabUser>('GET', '/user');
  }

  /**
   * Найти пользователя GitLab по username (для UC-03: связать CherryGit-юзера
   * с GitLab-аккаунтом).
   *
   * Использует `GET /users?username=<u>` — публичный endpoint, доступен любому
   * с валидным PAT-токеном (даже не-админу инстанса GitLab). Возвращает массив
   * (для username с учётом регистра — 0 или 1 элемент).
   *
   * Возвращает `null`, если пользователь не найден (UI должен показать «такого
   * username нет на этом GitLab-инстансе» вместо 500-ки).
   *
   * Документация: https://docs.gitlab.com/api/users/#for-non-administrator-users
   */
  async fetchUserByUsername(username: string): Promise<GitlabUser | null> {
    const trimmed = username.trim();
    if (trimmed.length === 0) return null;
    const users = await this.paginate<GitlabUser>('/users', { username: trimmed });
    // GitLab username — регистронечувствительный при поиске, поэтому фильтруем
    // строго по lower-case match, чтобы вернуть только точное совпадение.
    const exact = users.find(
      (u) => u.username.toLowerCase() === trimmed.toLowerCase()
    );
    return exact ?? null;
  }

  /**
   * Поиск пользователей GitLab по подстроке (email, username, name).
   *
   * Используется доработкой 4.4 для авто-резолва идентичностей:
   * `reconcileGitlabIdentities` зовёт search по `users.mail` и матчит
   * результат по точному совпадению email.
   *
   * ⚠ Важная особенность GitLab API: поле `email` в ответе `/users?search=`
   * присутствует **только** при PAT'е с правами админа инстанса. Для
   * обычного PAT'а email будет `undefined`, и auto-match не сработает.
   * В этом случае admin должен заранее сохранить email вручную через
   * `linkGitlabIdentity` с явным `email`.
   *
   * Документация: https://docs.gitlab.com/api/users/#list-users
   */
  async searchUsers(query: string): Promise<GitlabUser[]> {
    const trimmed = query.trim();
    if (trimmed.length === 0) return [];
    return this.paginate<GitlabUser>('/users', { search: trimmed });
  }

  /** Список проектов, в которых состоит владелец токена. */
  async fetchProjects(): Promise<GitlabProject[]> {
    return this.paginate<GitlabProject>('/projects', { membership: 'true', simple: 'false' });
  }

  /** Один проект по его числовому ID на стороне GitLab. */
  async fetchProject(gitlabProjectId: number): Promise<GitlabProject> {
    return this.requestJson<GitlabProject>('GET', `/projects/${gitlabProjectId}`);
  }

  /**
   * Коммиты проекта.
   * @param since ISO-метка; если задана — возвращаются коммиты после неё (инкрементальный sync).
   * @param ref имя ветки/тега/SHA. Рекомендуется явно передавать default_branch:
   *            при `ref=undefined` используется `all=true`, что включает feature-ветки
   *            и может зашумлять Bus Factor / Lead Time (FR-10, FR-04).
   */
  async fetchCommits(
    gitlabProjectId: number,
    since?: Date,
    ref?: string
  ): Promise<GitlabCommit[]> {
    const params: Record<string, string> = { with_stats: 'true' };
    if (since) params.since = since.toISOString();
    if (ref) {
      params.ref_name = ref;
    } else {
      params.all = 'true';
    }
    return this.paginate<GitlabCommit>(
      `/projects/${gitlabProjectId}/repository/commits`,
      params
    );
  }

  /** Один коммит со stats (additions/deletions/total). */
  async fetchCommit(gitlabProjectId: number, sha: string): Promise<GitlabCommit> {
    return this.requestJson<GitlabCommit>(
      'GET',
      `/projects/${gitlabProjectId}/repository/commits/${encodeURIComponent(sha)}`,
      { stats: 'true' }
    );
  }

  /**
   * Merge requests проекта.
   * @param sinceUpdatedAt инкрементальная закладка (updated_after).
   */
  async fetchMergeRequests(
    gitlabProjectId: number,
    sinceUpdatedAt?: Date
  ): Promise<GitlabMergeRequest[]> {
    const params: Record<string, string> = {
      state: 'all',
      scope: 'all',
      order_by: 'updated_at',
      sort: 'asc'
    };
    if (sinceUpdatedAt) params.updated_after = sinceUpdatedAt.toISOString();
    return this.paginate<GitlabMergeRequest>(
      `/projects/${gitlabProjectId}/merge_requests`,
      params
    );
  }

  /** Детальный MR (включает changes_count и diff_refs). */
  async fetchMergeRequest(
    gitlabProjectId: number,
    mrIid: number
  ): Promise<GitlabMergeRequest> {
    return this.requestJson<GitlabMergeRequest>(
      'GET',
      `/projects/${gitlabProjectId}/merge_requests/${mrIid}`
    );
  }

  /** Коммиты, вошедшие в MR (используется для связи commits ↔ merge_requests). */
  async fetchMergeRequestCommits(
    gitlabProjectId: number,
    mrIid: number
  ): Promise<GitlabCommit[]> {
    return this.paginate<GitlabCommit>(
      `/projects/${gitlabProjectId}/merge_requests/${mrIid}/commits`
    );
  }

  /**
   * Список изменений MR через legacy-эндпоинт `/changes`.
   * Используется для расчёта MR Size (FR-15) — `additions`/`deletions` парсятся
   * из текста diff методом `computeMrSize`.
   *
   * Эндпоинт помечен deprecated в новых версиях GitLab, но остаётся единственным
   * способом получить унифицированный diff одним запросом (альтернатива — N+1 на
   * /commits/:sha?stats=true). Замена `/diffs` пагинирована и не содержит stats.
   */
  async fetchMergeRequestChanges(
    gitlabProjectId: number,
    mrIid: number
  ): Promise<GitlabMergeRequestDiff[]> {
    const wrapper = await this.requestJson<{ changes?: GitlabMergeRequestDiff[] }>(
      'GET',
      `/projects/${gitlabProjectId}/merge_requests/${mrIid}/changes`
    );
    return wrapper.changes ?? [];
  }

  /**
   * Все заметки MR (комментарии и системные события).
   * Поле `system: false` + автор != автора MR → акт ревью (используется для firstReviewAt).
   */
  async fetchMergeRequestNotes(
    gitlabProjectId: number,
    mrIid: number
  ): Promise<GitlabNote[]> {
    return this.paginate<GitlabNote>(
      `/projects/${gitlabProjectId}/merge_requests/${mrIid}/notes`,
      { sort: 'asc', order_by: 'created_at' }
    );
  }

  /**
   * Approvals MR. approved_by[].approved_at — момент конкретного approve.
   * approvedAt в схеме CherryGit = min(approved_at).
   */
  async fetchMergeRequestApprovals(
    gitlabProjectId: number,
    mrIid: number
  ): Promise<GitlabApprovalsResponse> {
    return this.requestJson<GitlabApprovalsResponse>(
      'GET',
      `/projects/${gitlabProjectId}/merge_requests/${mrIid}/approvals`
    );
  }

  /**
   * Теги репозитория. search-фильтр поддерживает только `^prefix` и `suffix$`,
   * поэтому glob-паттерн (release_tag_pattern проекта) применяется уже на стороне CherryGit.
   */
  async fetchTags(gitlabProjectId: number, search?: string): Promise<GitlabTag[]> {
    const params: Record<string, string> = { order_by: 'updated', sort: 'desc' };
    if (search) params.search = search;
    return this.paginate<GitlabTag>(
      `/projects/${gitlabProjectId}/repository/tags`,
      params
    );
  }

  // -----------------------------------------------------------------------
  // Static helpers
  // -----------------------------------------------------------------------

  /**
   * Подсчёт размера MR по тексту diff (FR-15).
   * Считает строки `+`/`-` исключая git-метки заголовков (+++/---).
   *
   * Это аппроксимация: бинарные файлы и rename-only changes считаются как 0,
   * что соответствует общепринятой практике инструментов вроде GitClear.
   */
  static computeMrSize(changes: GitlabMergeRequestDiff[]): {
    linesAdded: number;
    linesRemoved: number;
    filesChanged: number;
  } {
    let linesAdded = 0;
    let linesRemoved = 0;

    for (const change of changes) {
      const lines = change.diff.split('\n');
      for (const line of lines) {
        if (line.startsWith('+') && !line.startsWith('+++')) linesAdded++;
        else if (line.startsWith('-') && !line.startsWith('---')) linesRemoved++;
      }
    }

    return { linesAdded, linesRemoved, filesChanged: changes.length };
  }

  // -----------------------------------------------------------------------
  // HTTP layer
  // -----------------------------------------------------------------------

  /** Один запрос без пагинации. */
  private async requestJson<T>(
    method: 'GET',
    path: string,
    query?: Record<string, string>
  ): Promise<T> {
    const response = await this.rawRequest(method, path, query, 0);
    return (await response.json()) as T;
  }

  /**
   * Итеративная offset-пагинация.
   * Запрашивает страницы пока сервер отдаёт `x-next-page`, защита MAX_PAGES.
   */
  private async paginate<T>(
    path: string,
    query: Record<string, string> = {}
  ): Promise<T[]> {
    const result: T[] = [];
    let page = 1;

    for (let i = 0; i < GitlabClient.MAX_PAGES; i++) {
      const response = await this.rawRequest(
        'GET',
        path,
        {
          ...query,
          per_page: String(GitlabClient.PER_PAGE),
          page: String(page)
        },
        0
      );

      const items = (await response.json()) as T[];
      if (!Array.isArray(items)) {
        throw new CustomError(
          HttpStatus.BAD_GATEWAY,
          `GitLab returned non-array for paginated endpoint ${path}`
        );
      }
      result.push(...items);

      const nextPage = response.headers.get('x-next-page');
      if (!nextPage || nextPage === '' || items.length < GitlabClient.PER_PAGE) break;
      page = Number(nextPage);
    }

    return result;
  }

  /**
   * Низкоуровневый запрос с таймаутом и ограниченным retry на 429.
   * Маппит HTTP-статусы GitLab в CustomError CherryGit.
   */
  private async rawRequest(
    method: 'GET',
    path: string,
    query: Record<string, string> | undefined,
    retryCount: number
  ): Promise<Response> {
    const url = this.buildUrl(path, query);

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          'PRIVATE-TOKEN': this.token,
          Accept: 'application/json'
        },
        signal: AbortSignal.timeout(GitlabClient.REQUEST_TIMEOUT_MS)
      });
    } catch (error) {
      const message = (error as Error).message || String(error);
      const isTimeout = (error as Error).name === 'TimeoutError' || message.includes('aborted');
      logger.error(`GitLab ${method} ${path} → network error: ${message}`);
      throw new CustomError(
        HttpStatus.GATEWAY_TIMEOUT,
        isTimeout ? 'GitLab request timed out' : `GitLab network error: ${message}`
      );
    }

    if (response.status === 429) {
      if (retryCount >= GitlabClient.MAX_RATE_LIMIT_RETRIES) {
        logger.error(
          `GitLab rate limit on ${path}: ${GitlabClient.MAX_RATE_LIMIT_RETRIES} retries exhausted`
        );
        throw new CustomError(
          HttpStatus.TOO_MANY_REQUESTS,
          'GitLab rate limit exceeded, retries exhausted'
        );
      }
      const waitMs = GitlabClient.computeRateLimitWaitMs(response);
      logger.warn(
        `GitLab rate limit on ${path}, retry ${retryCount + 1}/${GitlabClient.MAX_RATE_LIMIT_RETRIES} in ${waitMs}ms`
      );
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      return this.rawRequest(method, path, query, retryCount + 1);
    }

    if (response.ok) return response;

    // НЕ логируем тело — может содержать PII (имена, email)
    logger.error(`GitLab ${method} ${path} → ${response.status}`);

    switch (response.status) {
      case 401:
        throw new CustomError(HttpStatus.UNAUTHORIZED, 'Invalid GitLab token');
      case 403:
        throw new CustomError(HttpStatus.FORBIDDEN, 'GitLab token lacks required scope');
      case 404:
        throw new CustomError(HttpStatus.NOT_FOUND, `GitLab resource not found: ${path}`);
      default:
        throw new CustomError(
          HttpStatus.BAD_GATEWAY,
          `GitLab ${method} ${path} returned ${response.status}`
        );
    }
  }

  /**
   * Вычисление паузы перед retry. Приоритет:
   *  1. Retry-After (RFC 7231) — секунды ожидания, наиболее однозначный.
   *  2. RateLimit-Reset (IETF draft) — Unix timestamp (секунды) сброса лимита.
   *  3. Фолбэк: 5 секунд.
   * Результат ограничен сверху MAX_BACKOFF_MS.
   */
  private static computeRateLimitWaitMs(response: Response): number {
    const retryAfter = response.headers.get('retry-after');
    if (retryAfter) {
      const seconds = Number(retryAfter);
      if (Number.isFinite(seconds) && seconds >= 0) {
        return Math.min(seconds * 1000, GitlabClient.MAX_BACKOFF_MS);
      }
    }

    const reset = response.headers.get('ratelimit-reset');
    if (reset) {
      const resetTimestampSec = Number(reset);
      if (Number.isFinite(resetTimestampSec) && resetTimestampSec > 0) {
        const waitMs = resetTimestampSec * 1000 - Date.now();
        if (waitMs > 0) return Math.min(waitMs, GitlabClient.MAX_BACKOFF_MS);
      }
    }

    return 5_000;
  }

  private buildUrl(path: string, query?: Record<string, string>): string {
    const url = new URL(this.apiRoot + path);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        url.searchParams.set(key, value);
      }
    }
    return url.toString();
  }
}
