import { pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import type { TeamMemberRole } from './types/team-member-role.type';

import { baseSchema } from '../base.schema';
import { projects } from '../gitlab/schema';
import { users } from '../user/schema';

/**
 * Команды, сгруппированные вокруг GitLab-проектов.
 * Одна команда привязана к одному проекту в MVP.
 */
export const teams = pgTable('teams', {
  ...baseSchema,
  projectUid: uuid('project_uid')
    .references(() => projects.uid)
    .notNull(),
  name: text('name').notNull()
});

export type InsertTeam = typeof teams.$inferInsert;
export type SelectTeam = typeof teams.$inferSelect;

/**
 * Участники команды с ролью в контексте CherryGit.
 * Роль определяет, какие метрики доступны пользователю в дашборде.
 *
 * DEVELOPER — видит только свои метрики + командный baseline.
 * LEAD      — видит командные агрегаты, анонимизированные данные.
 * MANAGER   — видит кросс-командные DORA-метрики, без индивидуальных данных.
 */
export const teamMembers = pgTable(
  'team_members',
  {
    ...baseSchema,
    teamUid: uuid('team_uid')
      .references(() => teams.uid)
      .notNull(),
    userUid: uuid('user_uid')
      .references(() => users.uid)
      .notNull(),
    role: text('role').$type<TeamMemberRole>().default('DEVELOPER').notNull(),
    joinedAt: timestamp('joined_at').defaultNow().notNull(),
    /** GitLab username для сопоставления коммитов/MR с участником */
    gitlabUsername: text('gitlab_username').notNull()
  },
  (t) => ({
    /** Пользователь может состоять в команде только один раз */
    uniqueMemberPerTeam: unique('uq_member_per_team').on(t.teamUid, t.userUid)
  })
);

export type InsertTeamMember = typeof teamMembers.$inferInsert;
export type SelectTeamMember = typeof teamMembers.$inferSelect;
