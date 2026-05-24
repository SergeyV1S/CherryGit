export type Role = 'DEVELOPER' | 'LEAD' | 'HEAD' | 'ADMIN';

export type TeamRole = 'DEVELOPER' | 'LEAD';

export interface TeamMembership {
  uid: string;
  name: string;
  myRole: TeamRole;
  departmentUid: string | null;
}

export interface GitlabIdentity {
  uid: string;
  gitlabUsername: string;
  gitlabUserId: number;
  email: string | null;
  connectionUid: string;
  connectionName?: string;
}

export interface CurrentUser {
  uid: string;
  firstName: string;
  secondName: string;
  mail: string;
  role: Role;
  departmentUid: string | null;
  provisionedAt: string | null;
  isTempPassword: boolean;
  teams: TeamMembership[];
  gitlabIdentities: GitlabIdentity[];
}

/**
 * Состояние доступа текущего пользователя — гейт для UI-баннеров.
 * Соответствует backend MeAccessStatus.
 */
export type MeAccessStatus =
  | 'ready'
  | 'pending_provision'
  | 'pending_assignment'
  | 'temp_password';

export interface MeAccess {
  uid: string;
  role: Role;
  status: MeAccessStatus;
  teamsCount: number;
  hasDepartment: boolean;
  isTempPassword: boolean;
  provisionedAt: string | null;
  message: string;
}

export interface ApiResponse<T> {
  statusCode: number;
  message: T;
}

export interface ApiError {
  statusCode: number;
  message: string;
}

// ---------------------------------------------------------------------------
// Metric value types (mirror backend schema)
// ---------------------------------------------------------------------------

export interface CycleTimeMrValue {
  excludedDrafts: number;
  medianTotalSeconds: number | null;
  p90TotalSeconds: number | null;
  phases: {
    timeToFirstReviewMedianSeconds: number | null;
    timeToFirstReviewP90Seconds: number | null;
    timeInReviewMedianSeconds: number | null;
    timeInReviewP90Seconds: number | null;
    timeToMergeAfterApprovalMedianSeconds: number | null;
    timeToMergeAfterApprovalP90Seconds: number | null;
  };
  sampleSize: number;
  sampleSizePerPhase: {
    timeToFirstReview: number;
    timeInReview: number;
    timeToMergeAfterApproval: number;
  };
}

export interface MrSizeBucket {
  label: string;
  count: number;
  percent: number;
}

export interface MrSizeValue {
  buckets: MrSizeBucket[];
  excludedDrafts: number;
  medianLinesChanged: number | null;
  p90LinesChanged: number | null;
  sampleSize: number;
}

export interface MyMetricsTeam {
  teamUid: string;
  teamName: string;
  personal: {
    cycle_time_mr: CycleTimeMrValue;
    mr_size: MrSizeValue;
  };
  baseline: {
    cycle_time_mr: CycleTimeMrValue;
    mr_size: MrSizeValue;
  };
}

export interface MyMetricsReport {
  gitlabUsernames: string[];
  periodEnd: string;
  periodStart: string;
  teams: MyMetricsTeam[];
  userUid: string;
}

// ---------------------------------------------------------------------------
// Team metric reports
// ---------------------------------------------------------------------------

export interface TeamListItem {
  uid: string;
  name: string;
  myRole?: TeamRole;
  departmentUid?: string | null;
}

export interface TeamCycleTimeMrReport {
  metricType: string;
  periodStart: string;
  periodEnd: string;
  teamUid: string;
  projectUids: string[];
  value: CycleTimeMrValue;
}

export interface TeamMrSizeReport {
  metricType: string;
  periodStart: string;
  periodEnd: string;
  teamUid: string;
  projectUids: string[];
  value: MrSizeValue;
}

export type BusFactorColor = 'green' | 'red' | 'yellow';

export interface BusFactorModule {
  name: string;
  pathPattern: string | null;
  isImplicit: boolean;
  activeContributors: number;
  authors: string[];
  color: BusFactorColor;
}

export interface BusFactorValue {
  excludedMrsWithoutPaths: number;
  modules: BusFactorModule[];
  overallBusFactor: number | null;
  sampleSize: number;
  windowDays: number;
}

export interface TeamBusFactorReport {
  metricType: string;
  teamUid: string;
  value: BusFactorValue;
}

// ---------------------------------------------------------------------------
// DORA metrics (for HEAD/ADMIN)
// ---------------------------------------------------------------------------

export type DeploymentFrequencyCategory = 'elite' | 'high' | 'medium' | 'low';

export interface LeadTimeValue {
  deploymentsConsidered: number;
  excludedMrsWithoutCommits: number;
  medianSeconds: number | null;
  p90Seconds: number | null;
  sampleSize: number;
}

export interface DeploymentFrequencyValue {
  category: DeploymentFrequencyCategory;
  count: number;
  granularity: string;
  perDay: number;
  periodDays: number;
  timeline: { bucket: string; count: number }[];
}

export interface ChangeFailureRateValue {
  breakdown: { hotfixDeploys: number; revertDeploys: number };
  category: DeploymentFrequencyCategory | null;
  failedDeploys: number;
  granularity: string;
  ratePercent: number;
  timeline: { bucket: string; totalDeploys: number; failedDeploys: number; ratePercent: number }[];
  totalDeploys: number;
}

export interface TeamLeadTimeReport {
  metricType: 'lead_time';
  periodStart: string;
  periodEnd: string;
  teamUid: string;
  projectUids: string[];
  value: LeadTimeValue;
}

export interface TeamDeploymentFrequencyReport {
  metricType: 'deployment_frequency';
  periodStart: string;
  periodEnd: string;
  teamUid: string;
  projectUids: string[];
  value: DeploymentFrequencyValue;
}

export interface TeamChangeFailureRateReport {
  metricType: 'change_failure_rate';
  periodStart: string;
  periodEnd: string;
  teamUid: string;
  projectUids: string[];
  value: ChangeFailureRateValue;
}

// ---------------------------------------------------------------------------
// Snapshots history (personal /me/metrics/history)
// ---------------------------------------------------------------------------

export interface MetricSnapshot {
  uid: string;
  entityType: 'team' | 'user';
  entityId: string;
  metricType: 'cycle_time_mr' | 'mr_size' | 'lead_time' | 'deployment_frequency' | 'change_failure_rate' | 'bus_factor';
  periodStart: string;
  periodEnd: string;
  value: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface MyMetricsHistoryTeam {
  teamUid: string;
  teamName: string;
  myRole: TeamRole;
  history: {
    cycle_time_mr: MetricSnapshot[];
    mr_size: MetricSnapshot[];
  };
}

export interface MyMetricsHistoryReport {
  userUid: string;
  from: string;
  to: string;
  teams: MyMetricsHistoryTeam[];
}

export interface CrossTeamDoraTeam {
  teamUid: string;
  teamName: string;
  projectCount: number;
  leadTime: LeadTimeValue | null;
  deploymentFrequency: DeploymentFrequencyValue | null;
  changeFailureRate: ChangeFailureRateValue | null;
}

export interface CrossTeamDoraReport {
  departmentUid: string | null;
  periodStart: string;
  periodEnd: string;
  teams: CrossTeamDoraTeam[];
}

// ---------------------------------------------------------------------------
// Admin types
// ---------------------------------------------------------------------------

export type ConnectionStatus = 'active' | 'inactive' | 'error';

export interface GitlabConnection {
  uid: string;
  ownerUid: string;
  name: string;
  baseUrl: string;
  status: ConnectionStatus;
  lastCheckedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Запись из пула discovery (`gitlab_available_projects`).
 * Поле `connectedProjectUid != null` означает, что проект уже подключён;
 * `connectedProjectName` — имя в `projects` (как было сохранено).
 */
export interface AvailableProject {
  uid: string;
  gitlabProjectId: number;
  name: string;
  namespace: string | null;
  description: string | null;
  defaultBranch: string | null;
  visibility: string | null;
  webUrl: string | null;
  lastActivityAt: string | null;
  lastSeenAt: string;
  connectedProjectUid: string | null;
  connectedProjectName: string | null;
}

/** Отчёт о ручном/авто-discovery от backend. */
export interface DiscoveryReport {
  connectionUid: string;
  durationMs: number;
  projectsSeen: number;
  gitlabUsersUpserted: number;
  projectMembershipsUpserted: number;
  staleEntriesRemoved: number;
}

/** Запись реестра GitLab-участников (`gitlab_users`). */
export interface GitlabUserRegistryItem {
  uid: string;
  gitlabConnectionUid: string;
  gitlabConnectionName: string | null;
  gitlabUserId: number;
  gitlabUsername: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  state: string | null;
  webUrl: string | null;
  isProvisioned: boolean;
  mappedUserUid: string | null;
  mappedUserMail: string | null;
  mappedUserName: string | null;
  lastSeenAt: string;
}

/** Запись результата provisioning одного GitLab-пользователя. */
export interface ProvisionedUserRecord {
  gitlabUserUid: string;
  gitlabUsername: string;
  userUid: string;
  mail: string;
  firstName: string;
  secondName: string;
  /** Plaintext-пароль возвращается ОДИН раз и только для созданных аккаунтов. */
  temporaryPassword?: string;
  status: 'created' | 'reused' | 'skipped';
  reason?: string;
}

export interface ProvisionReport {
  attempted: number;
  created: number;
  reused: number;
  skipped: number;
  records: ProvisionedUserRecord[];
}

/** Результат POST /admin/projects (подключение проекта из пула). */
export interface ConnectProjectResult {
  project: AdminProject;
  provisioning: ProvisionReport;
}

export interface AdminProject {
  uid: string;
  gitlabConnectionUid: string;
  gitlabProjectId: number;
  name: string;
  namespace: string | null;
  description: string | null;
  defaultBranch: string | null;
  releaseTagPattern: string;
  hotfixLabels: string[];
  revertLabels: string[];
  createdAt: string;
  updatedAt: string;
  lastSyncAt: string | null;
  teams: { uid: string; name: string }[];
}

export interface AdminTeam {
  uid: string;
  name: string;
  description: string | null;
  departmentUid: string | null;
}

export interface AdminTeamMember {
  uid: string;
  userUid: string;
  firstName: string;
  secondName: string;
  mail: string;
  role: 'DEVELOPER' | 'LEAD';
  joinedAt: string;
}

export interface TeamProjectLink {
  uid: string;
  name: string;
  namespace: string | null;
  defaultBranch: string | null;
}

export interface TeamGitlabCandidate {
  gitlabUsername: string;
  commitsCount: number;
  mrsCount: number;
  reviewsCount: number;
  mappedUser: {
    uid: string;
    firstName: string;
    secondName: string;
    mail: string;
  } | null;
  alreadyInTeam: boolean;
}

export interface AdminDepartment {
  uid: string;
  name: string;
  teamsCount: number;
  headsCount: number;
  createdAt: string;
}

export interface AdminUser {
  uid: string;
  firstName: string;
  secondName: string;
  mail: string;
  phone: string | null;
  role: Role;
  departmentUid: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUserDetail extends AdminUser {
  teams: { uid: string; name: string; role: 'DEVELOPER' | 'LEAD' }[];
  gitlabIdentities: GitlabIdentity[];
}

export interface UserRoleStats {
  ADMIN: number;
  HEAD: number;
  LEAD: number;
  DEVELOPER: number;
}

export interface SyncStatus {
  projectUid: string;
  status: 'idle' | 'running' | 'success' | 'error';
  lastSyncAt: string | null;
  lastError: string | null;
  commitsCount: number;
  mrsCount: number;
}

export interface AuditLogItem {
  uid: string;
  userUid: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
  user?: { firstName: string; secondName: string; mail: string } | null;
}

export interface AuditLogPage {
  items: AuditLogItem[];
  total: number;
  limit: number;
  offset: number;
}
