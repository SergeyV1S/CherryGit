import { notImplemented } from '@/lib/not-implemented';

import type { CreateUserDto, UpdateUserDto } from '../user/dto/create-user.dto';

/**
 * Управление пользователями системы (ВКР 2.2.7 — admin only).
 * Включает назначение глобальной роли (DEVELOPER / LEAD / HEAD / ADMIN)
 * и привязку к отделу.
 */

export const listUsers = async () => {
  notImplemented('usersAdmin.listUsers');
};

export const getUser = async (_uid: string) => {
  notImplemented('usersAdmin.getUser');
};

export const createUser = async (_actorUid: string, _dto: CreateUserDto) => {
  notImplemented('usersAdmin.createUser');
};

export const updateUser = async (_actorUid: string, _uid: string, _dto: UpdateUserDto) => {
  notImplemented('usersAdmin.updateUser');
};

export const deleteUser = async (_actorUid: string, _uid: string) => {
  notImplemented('usersAdmin.deleteUser');
};

/** Связать учётную запись CherryGit с GitLab-аккаунтом */
export const linkGitlabIdentity = async (
  _userUid: string,
  _gitlabConnectionUid: string,
  _gitlabUsername: string,
  _gitlabUserId: number
) => {
  notImplemented('usersAdmin.linkGitlabIdentity');
};

export const unlinkGitlabIdentity = async (_identityUid: string) => {
  notImplemented('usersAdmin.unlinkGitlabIdentity');
};
