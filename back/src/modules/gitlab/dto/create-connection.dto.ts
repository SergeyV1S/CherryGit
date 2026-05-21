import type { InsertGitlabConnection } from '@/db/drizzle/schema/gitlab/schema';

export class CreateGitlabConnectionDto implements Partial<InsertGitlabConnection> {
  name!: string;
  baseUrl!: string;
  /** Незашифрованный PAT-токен. Сервис шифрует перед сохранением. */
  token!: string;
}

export class UpdateGitlabConnectionDto {
  name?: string;
  token?: string;
}
