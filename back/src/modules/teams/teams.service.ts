import { notImplemented } from '@/lib/not-implemented';

import type {
  AddTeamMemberDto,
  AttachProjectDto,
  CreateTeamDto,
  UpdateTeamDto,
  UpdateTeamMemberDto
} from './dto/team.dto';

// ===== Список команд для пользователя =====

/**
 * Список команд, доступных пользователю.
 * DEVELOPER — только команды, в которых он состоит.
 * LEAD — команды, в которых он LEAD.
 * HEAD — все команды отдела.
 * ADMIN — все команды.
 */
export const listTeamsForUser = async (_userUid: string) => {
  notImplemented('teams.listTeamsForUser');
};

export const getTeam = async (_userUid: string, _teamUid: string) => {
  notImplemented('teams.getTeam');
};

// ===== Admin CRUD =====

export const listAllTeams = async () => {
  notImplemented('teams.listAllTeams');
};

export const createTeam = async (_actorUid: string, _dto: CreateTeamDto) => {
  notImplemented('teams.createTeam');
};

export const updateTeam = async (_uid: string, _dto: UpdateTeamDto) => {
  notImplemented('teams.updateTeam');
};

export const deleteTeam = async (_actorUid: string, _uid: string) => {
  notImplemented('teams.deleteTeam');
};

// ===== Members =====

export const listMembers = async (_teamUid: string) => {
  notImplemented('teams.listMembers');
};

export const addMember = async (_teamUid: string, _dto: AddTeamMemberDto) => {
  notImplemented('teams.addMember');
};

export const updateMember = async (
  _teamUid: string,
  _memberUid: string,
  _dto: UpdateTeamMemberDto
) => {
  notImplemented('teams.updateMember');
};

export const removeMember = async (_teamUid: string, _memberUid: string) => {
  notImplemented('teams.removeMember');
};

// ===== Projects attachment =====

export const listTeamProjects = async (_teamUid: string) => {
  notImplemented('teams.listTeamProjects');
};

export const attachProject = async (_teamUid: string, _dto: AttachProjectDto) => {
  notImplemented('teams.attachProject');
};

export const detachProject = async (_teamUid: string, _projectUid: string) => {
  notImplemented('teams.detachProject');
};
