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
  teams: TeamMembership[];
  gitlabIdentities: GitlabIdentity[];
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

export interface GitlabProject {
  id: number;
  name: string;
  nameWithNamespace: string;
  webUrl: string;
  defaultBranch: string | null;
}

export interface AdminProject {
  uid: string;
  gitlabProjectId: number;
  connectionUid: string;
  name: string;
  nameWithNamespace: string;
  webUrl: string;
  tagPattern: string | null;
  hotfixLabels: string[];
  revertLabels: string[];
  syncedAt: string | null;
  createdAt: string;
}

export interface AdminTeam {
  uid: string;
  name: string;
  description: string | null;
  departmentUid: string | null;
}

export interface AdminTeamMember {
  uid: string;
  userId: string;
  firstName: string;
  secondName: string;
  mail: string;
  role: 'DEVELOPER' | 'LEAD';
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
