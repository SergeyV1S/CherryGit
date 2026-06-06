/**
 * Типы ответов GitLab REST API v4.
 * Описывают только поля, используемые CherryGit.
 *
 * Документация: https://docs.gitlab.com/api/api_resources/
 */

export interface GitlabUser {
  avatar_url?: string;
  email?: string;
  id: number;
  name: string;
  /** public_email доступен на /users без админ-токена; email — только админу */
  public_email?: string;
  state: 'active' | 'blocked' | 'deactivated';
  username: string;
  web_url: string;
}

/**
 * Участник проекта (GET /projects/:id/members/all).
 *
 * access_level — стандартные GitLab-уровни:
 *  10  Guest
 *  20  Reporter
 *  30  Developer
 *  40  Maintainer
 *  50  Owner
 */
export interface GitlabProjectMember extends GitlabUser {
  access_level: number;
  expires_at: string | null;
}

export interface GitlabNamespace {
  full_path: string;
  id: number;
  kind: 'group' | 'user';
  name: string;
  path: string;
}

export interface GitlabProject {
  created_at: string;
  default_branch: string | null;
  description: string | null;
  id: number;
  last_activity_at: string;
  name: string;
  name_with_namespace?: string;
  namespace: GitlabNamespace;
  path: string;
  path_with_namespace?: string;
  visibility: 'internal' | 'private' | 'public';
  web_url: string;
}

export interface GitlabCommitStats {
  additions: number;
  deletions: number;
  total: number;
}

export interface GitlabCommit {
  author_email: string;
  author_name: string;
  authored_date: string;
  committed_date: string;
  committer_email: string;
  committer_name: string;
  id: string;
  message: string;
  parent_ids: string[];
  short_id: string;
  stats?: GitlabCommitStats;
  title: string;
  web_url: string;
}

export interface GitlabMergeRequest {
  author: GitlabUser;
  /** Доступно только в детальном эндпоинте /merge_requests/:iid */
  changes_count?: string;
  closed_at: string | null;
  created_at: string;
  description: string | null;
  downvotes: number;
  id: number;
  iid: number;
  labels: string[];
  merged_at: string | null;
  project_id: number;
  source_branch: string;
  state: 'closed' | 'locked' | 'merged' | 'opened';
  target_branch: string;
  title: string;
  updated_at: string;
  upvotes: number;
  user_notes_count: number;
  web_url: string;
}

export interface GitlabNote {
  author: GitlabUser;
  body: string;
  created_at: string;
  id: number;
  noteable_type: string;
  resolvable: boolean;
  /** true = системное событие (assigned, label added и т.п.), не комментарий ревьюера */
  system: boolean;
  updated_at: string;
}

export interface GitlabApproval {
  approved_at: string;
  user: GitlabUser;
}

export interface GitlabApprovalsResponse {
  approvals_left: number;
  approvals_required: number;
  approved: boolean;
  approved_by: GitlabApproval[];
  id: number;
  iid: number;
  merge_status: string;
}

export interface GitlabTagCommitRef {
  author_email: string;
  author_name: string;
  authored_date: string;
  committed_date: string;
  id: string;
  message: string;
  parent_ids: string[];
  short_id: string;
  title: string;
}

export interface GitlabTag {
  commit: GitlabTagCommitRef;
  created_at: string | null;
  message: string | null;
  name: string;
  protected: boolean;
  release: { tag_name: string; description: string } | null;
  target: string;
}

/** Diff-stats отдельного MR (GET /merge_requests/:iid/changes deprecated → /diffs или поле в single MR) */
export interface GitlabMergeRequestDiff {
  a_mode: string;
  b_mode: string;
  deleted_file: boolean;
  diff: string;
  new_file: boolean;
  new_path: string;
  old_path: string;
  renamed_file: boolean;
}
