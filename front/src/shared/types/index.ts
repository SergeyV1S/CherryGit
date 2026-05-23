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
