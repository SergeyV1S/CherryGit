import type {
  AdminDepartment,
  AdminProject,
  AdminTeam,
  AdminTeamMember,
  AdminUser,
  AdminUserDetail,
  ApiResponse,
  AuditLogPage,
  AvailableProject,
  ConnectProjectResult,
  DiscoveryReport,
  GitlabConnection,
  GitlabUserRegistryItem,
  ProvisionReport,
  SyncStatus,
  TeamGitlabCandidate,
  TeamProjectLink,
  UserRoleStats
} from '@shared/types';

import { api } from './instance';

// ---------------------------------------------------------------------------
// GitLab connections
// ---------------------------------------------------------------------------

export const adminGitlabApi = {
  listConnections: async (): Promise<GitlabConnection[]> => {
    const res = await api.get<ApiResponse<GitlabConnection[]>>('/admin/gitlab/connections');
    return res.data.message;
  },

  createConnection: async (dto: {
    name: string;
    baseUrl: string;
    token: string;
  }): Promise<GitlabConnection> => {
    const res = await api.post<ApiResponse<GitlabConnection>>('/admin/gitlab/connections', dto);
    return res.data.message;
  },

  updateConnection: async (
    uid: string,
    dto: { name?: string; baseUrl?: string; token?: string }
  ): Promise<GitlabConnection> => {
    const res = await api.patch<ApiResponse<GitlabConnection>>(
      `/admin/gitlab/connections/${uid}`,
      dto
    );
    return res.data.message;
  },

  deleteConnection: async (uid: string): Promise<void> => {
    await api.delete(`/admin/gitlab/connections/${uid}`);
  },

  testConnection: async (uid: string): Promise<{ ok: boolean; username?: string; error?: string }> => {
    const res = await api.post<ApiResponse<{ ok: boolean; username?: string; error?: string }>>(
      `/admin/gitlab/connections/${uid}/test`
    );
    return res.data.message;
  },

  /**
   * Пул проектов discovery (snapshot из БД, не дёргает GitLab).
   * Чтобы обновить — вызвать `triggerDiscovery`.
   */
  listAvailableProjects: async (uid: string): Promise<AvailableProject[]> => {
    const res = await api.get<ApiResponse<AvailableProject[]>>(
      `/admin/gitlab/connections/${uid}/available-projects`
    );
    return res.data.message;
  },

  /** Ручной discovery — обходит GitLab по токену и обновляет пул проектов + участников. */
  triggerDiscovery: async (uid: string): Promise<DiscoveryReport> => {
    const res = await api.post<ApiResponse<DiscoveryReport>>(
      `/admin/gitlab/connections/${uid}/discover`
    );
    return res.data.message;
  }
};

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export const adminProjectsApi = {
  listProjects: async (): Promise<AdminProject[]> => {
    const res = await api.get<ApiResponse<AdminProject[]>>('/admin/projects');
    return res.data.message;
  },

  /**
   * Подключение проекта из пула discovery. Возвращает созданный проект
   * + provisioning-отчёт с временными паролями новых юзеров (показывать
   * ОДИН раз, после reload их уже не получить).
   */
  connectProject: async (dto: {
    availableProjectUid: string;
    releaseTagPattern?: string;
    hotfixLabels?: string[];
    revertLabels?: string[];
  }): Promise<ConnectProjectResult> => {
    const res = await api.post<ApiResponse<ConnectProjectResult>>('/admin/projects', dto);
    return res.data.message;
  },

  deleteProject: async (uid: string): Promise<void> => {
    await api.delete(`/admin/projects/${uid}`);
  },

  triggerResync: async (uid: string): Promise<void> => {
    await api.post(`/admin/projects/${uid}/resync`);
  },

  /**
   * Полная замена набора привязанных команд. `teamUids: []` отвяжет все.
   * Поддерживает и обновление других полей (releaseTagPattern и т.п.).
   */
  updateProject: async (
    uid: string,
    dto: {
      teamUids?: string[];
      releaseTagPattern?: string;
      hotfixLabels?: string[];
      revertLabels?: string[];
    }
  ): Promise<AdminProject> => {
    const res = await api.patch<ApiResponse<AdminProject>>(`/admin/projects/${uid}`, dto);
    return res.data.message;
  }
};

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

export const adminTeamsApi = {
  listTeams: async (): Promise<AdminTeam[]> => {
    const res = await api.get<ApiResponse<AdminTeam[]>>('/admin/teams');
    return res.data.message;
  },

  createTeam: async (dto: {
    name: string;
    description?: string;
    departmentUid?: string;
  }): Promise<AdminTeam> => {
    const res = await api.post<ApiResponse<AdminTeam>>('/admin/teams', dto);
    return res.data.message;
  },

  updateTeam: async (
    uid: string,
    dto: { name?: string; description?: string; departmentUid?: string | null }
  ): Promise<AdminTeam> => {
    const res = await api.patch<ApiResponse<AdminTeam>>(`/admin/teams/${uid}`, dto);
    return res.data.message;
  },

  deleteTeam: async (uid: string): Promise<void> => {
    await api.delete(`/admin/teams/${uid}`);
  },

  listMembers: async (teamUid: string): Promise<AdminTeamMember[]> => {
    const res = await api.get<ApiResponse<AdminTeamMember[]>>(`/admin/teams/${teamUid}/members`);
    return res.data.message;
  },

  addMember: async (
    teamUid: string,
    dto: { userUid: string; role: 'DEVELOPER' | 'LEAD' }
  ): Promise<AdminTeamMember> => {
    const res = await api.post<ApiResponse<AdminTeamMember>>(
      `/admin/teams/${teamUid}/members`,
      dto
    );
    return res.data.message;
  },

  removeMember: async (teamUid: string, memberUid: string): Promise<void> => {
    await api.delete(`/admin/teams/${teamUid}/members/${memberUid}`);
  },

  updateMemberRole: async (
    teamUid: string,
    memberUid: string,
    role: 'DEVELOPER' | 'LEAD'
  ): Promise<AdminTeamMember> => {
    const res = await api.patch<ApiResponse<AdminTeamMember>>(
      `/admin/teams/${teamUid}/members/${memberUid}`,
      { role }
    );
    return res.data.message;
  },

  listCandidatesFromGitlab: async (teamUid: string): Promise<TeamGitlabCandidate[]> => {
    const res = await api.get<ApiResponse<TeamGitlabCandidate[]>>(
      `/admin/teams/${teamUid}/members/candidates`
    );
    return res.data.message;
  },

  // ---- Project attachment (per-team) ----

  listTeamProjects: async (teamUid: string): Promise<TeamProjectLink[]> => {
    const res = await api.get<ApiResponse<TeamProjectLink[]>>(
      `/admin/teams/${teamUid}/projects`
    );
    return res.data.message;
  },

  attachProject: async (teamUid: string, projectUid: string): Promise<void> => {
    await api.post(`/admin/teams/${teamUid}/projects`, { projectUid });
  },

  detachProject: async (teamUid: string, projectUid: string): Promise<void> => {
    await api.delete(`/admin/teams/${teamUid}/projects/${projectUid}`);
  }
};

// ---------------------------------------------------------------------------
// GitLab users (реестр participants по всем connections + provisioning)
// ---------------------------------------------------------------------------

export const adminGitlabUsersApi = {
  list: async (params?: {
    connectionUid?: string;
    projectUid?: string;
    search?: string;
    provisioned?: 'true' | 'false';
    limit?: number;
    offset?: number;
  }): Promise<{ items: GitlabUserRegistryItem[]; total: number }> => {
    const res = await api.get<ApiResponse<{ items: GitlabUserRegistryItem[]; total: number }>>(
      '/admin/gitlab-users',
      { params }
    );
    return res.data.message;
  },

  /** Создать CherryGit-аккаунт для одного GitLab-пользователя. */
  provisionOne: async (gitlabUserUid: string): Promise<ProvisionReport> => {
    const res = await api.post<ApiResponse<ProvisionReport>>(
      `/admin/gitlab-users/${gitlabUserUid}/provision`
    );
    return res.data.message;
  },

  /** Bulk-provisioning по списку UID. */
  provisionBulk: async (gitlabUserUids: string[]): Promise<ProvisionReport> => {
    const res = await api.post<ApiResponse<ProvisionReport>>(
      '/admin/gitlab-users/provision/bulk',
      { gitlabUserUids }
    );
    return res.data.message;
  }
};

// ---------------------------------------------------------------------------
// Departments
// ---------------------------------------------------------------------------

export const adminDepartmentsApi = {
  listDepartments: async (): Promise<AdminDepartment[]> => {
    const res = await api.get<ApiResponse<AdminDepartment[]>>('/admin/departments');
    return res.data.message;
  },

  createDepartment: async (dto: { name: string }): Promise<AdminDepartment> => {
    const res = await api.post<ApiResponse<AdminDepartment>>('/admin/departments', dto);
    return res.data.message;
  },

  updateDepartment: async (uid: string, dto: { name: string }): Promise<AdminDepartment> => {
    const res = await api.patch<ApiResponse<AdminDepartment>>(`/admin/departments/${uid}`, dto);
    return res.data.message;
  },

  deleteDepartment: async (uid: string): Promise<void> => {
    await api.delete(`/admin/departments/${uid}`);
  },

  attachTeam: async (departmentUid: string, teamUid: string): Promise<void> => {
    await api.post(`/admin/departments/${departmentUid}/teams`, { teamUid });
  },

  detachTeam: async (departmentUid: string, teamUid: string): Promise<void> => {
    await api.delete(`/admin/departments/${departmentUid}/teams/${teamUid}`);
  },

  assignHead: async (departmentUid: string, userUid: string): Promise<void> => {
    await api.post(`/admin/departments/${departmentUid}/heads`, { userUid });
  },

  unassignHead: async (departmentUid: string, userUid: string): Promise<void> => {
    await api.delete(`/admin/departments/${departmentUid}/heads/${userUid}`);
  }
};

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export const adminUsersApi = {
  listUsers: async (params?: {
    role?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ items: AdminUser[]; total: number }> => {
    const res = await api.get<ApiResponse<{ items: AdminUser[]; total: number }>>(
      '/admin/users',
      { params }
    );
    return res.data.message;
  },

  getRoleStats: async (): Promise<UserRoleStats> => {
    const res = await api.get<ApiResponse<UserRoleStats>>('/admin/users/stats/by-role');
    return res.data.message;
  },

  getUser: async (uid: string): Promise<AdminUserDetail> => {
    const res = await api.get<ApiResponse<AdminUserDetail>>(`/admin/users/${uid}`);
    return res.data.message;
  },

  createUser: async (dto: {
    firstName: string;
    secondName: string;
    mail: string;
    password?: string;
    role?: string;
  }): Promise<AdminUser & { generatedPassword?: string }> => {
    const res = await api.post<ApiResponse<AdminUser & { generatedPassword?: string }>>(
      '/admin/users',
      dto
    );
    return res.data.message;
  },

  updateUser: async (
    uid: string,
    dto: { firstName?: string; secondName?: string; mail?: string; phone?: string }
  ): Promise<AdminUser> => {
    const res = await api.patch<ApiResponse<AdminUser>>(`/admin/users/${uid}`, dto);
    return res.data.message;
  },

  deleteUser: async (uid: string): Promise<void> => {
    await api.delete(`/admin/users/${uid}`);
  },

  changeRole: async (uid: string, role: string): Promise<AdminUser> => {
    const res = await api.post<ApiResponse<AdminUser>>(`/admin/users/${uid}/role`, { role });
    return res.data.message;
  },

  resetPassword: async (uid: string, password: string): Promise<void> => {
    await api.post(`/admin/users/${uid}/password`, { password });
  },

  reconcileGitlabIdentities: async (): Promise<{
    attempted: number;
    created: number;
    skipped: number;
    failed: number;
  }> => {
    const res = await api.post<
      ApiResponse<{ attempted: number; created: number; skipped: number; failed: number }>
    >('/admin/users/gitlab-identities/reconcile');
    return res.data.message;
  }
};

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

export const adminSyncApi = {
  getStatus: async (projectUid: string): Promise<SyncStatus> => {
    const res = await api.get<ApiResponse<SyncStatus>>(
      `/admin/sync/projects/${projectUid}/status`
    );
    return res.data.message;
  },

  triggerSync: async (projectUid: string): Promise<void> => {
    await api.post(`/admin/sync/projects/${projectUid}/run`);
  },

  recalculate: async (projectUid: string): Promise<void> => {
    await api.post(`/admin/sync/projects/${projectUid}/recalculate`);
  }
};

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

export const adminAuditApi = {
  listLogs: async (params?: {
    action?: string;
    entityType?: string;
    userUid?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  }): Promise<AuditLogPage> => {
    const res = await api.get<ApiResponse<AuditLogPage>>('/admin/audit', { params });
    return res.data.message;
  },

  listKnownActions: async (): Promise<string[]> => {
    const res = await api.get<ApiResponse<string[]>>('/admin/audit/actions');
    return res.data.message;
  },

  listKnownEntityTypes: async (): Promise<string[]> => {
    const res = await api.get<ApiResponse<string[]>>('/admin/audit/entity-types');
    return res.data.message;
  },

  getExportUrl: (): string => '/api/admin/audit/export'
};
