import { notImplemented } from '@/lib/not-implemented';

/**
 * Клиент GitLab REST API (ВКР 3.5.1: реализация IDataSource).
 * Используется sync-модулем при инкрементальном сборе данных.
 *
 * Документация GitLab API: https://docs.gitlab.com/api/api_resources/
 */
export class GitlabClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string
  ) {}

  /** Проверить валидность токена (GET /user) */
  async ping(): Promise<boolean> {
    return notImplemented('GitlabClient.ping');
  }

  async fetchProjects(): Promise<unknown[]> {
    return notImplemented('GitlabClient.fetchProjects');
  }

  async fetchCommits(_gitlabProjectId: number, _since?: Date): Promise<unknown[]> {
    return notImplemented('GitlabClient.fetchCommits');
  }

  async fetchMergeRequests(_gitlabProjectId: number, _sinceIid?: number): Promise<unknown[]> {
    return notImplemented('GitlabClient.fetchMergeRequests');
  }

  async fetchMergeRequestNotes(
    _gitlabProjectId: number,
    _mrIid: number
  ): Promise<unknown[]> {
    return notImplemented('GitlabClient.fetchMergeRequestNotes');
  }

  async fetchMergeRequestApprovals(
    _gitlabProjectId: number,
    _mrIid: number
  ): Promise<unknown> {
    return notImplemented('GitlabClient.fetchMergeRequestApprovals');
  }

  async fetchTags(_gitlabProjectId: number): Promise<unknown[]> {
    return notImplemented('GitlabClient.fetchTags');
  }
}
