import type { TeamMemberRole } from '@/db/drizzle/schema/teams/types/team-member-role.type';

export class CreateTeamDto {
  name!: string;
  description?: string;
  departmentUid?: string;
  /** Идентификаторы проектов для привязки к команде */
  projectUids?: string[];
}

export class UpdateTeamDto {
  name?: string;
  description?: string;
  departmentUid?: string;
}

export class AddTeamMemberDto {
  userUid!: string;
  role!: TeamMemberRole;
}

export class UpdateTeamMemberDto {
  role!: TeamMemberRole;
}

export class AttachProjectDto {
  projectUid!: string;
}
