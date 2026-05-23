class Routes {
  readonly login = '/login' as const;
  readonly register = '/register' as const;

  readonly dashboard = '/dashboard' as const;

  readonly developer = {
    root: '/me' as const,
    metrics: '/me/metrics' as const,
    history: '/me/history' as const
  };

  readonly lead = {
    team: (teamUid: string) => `/teams/${teamUid}` as const,
    teamMetrics: (teamUid: string) => `/teams/${teamUid}/metrics` as const,
    teamBusFactor: (teamUid: string) => `/teams/${teamUid}/bus-factor` as const
  };

  readonly head = {
    root: '/department' as const,
    dora: '/department/dora' as const,
    trend: '/department/trend' as const
  };

  readonly admin = {
    root: '/admin' as const,
    users: '/admin/users' as const,
    user: (uid: string) => `/admin/users/${uid}` as const,
    teams: '/admin/teams' as const,
    team: (uid: string) => `/admin/teams/${uid}` as const,
    departments: '/admin/departments' as const,
    department: (uid: string) => `/admin/departments/${uid}` as const,
    gitlab: '/admin/gitlab' as const,
    projects: '/admin/projects' as const,
    sync: '/admin/sync' as const,
    audit: '/admin/audit' as const
  };
}

export const ROUTES = new Routes();
