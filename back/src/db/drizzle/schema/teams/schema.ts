import { pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import type { TeamMemberRole } from './types/team-member-role.type';

import { baseSchema } from '../base.schema';
import { departments } from '../departments/schema';
import { projects } from '../gitlab/schema';
import { users } from '../user/schema';

/**
 * Команды разработки. Принадлежат отделу (departments).
 * Связь команды с проектами — many-to-many через teamProjects.
 */
export const teams = pgTable('teams', {
  ...baseSchema,
  /** Отдел, к которому относится команда. Nullable: в MVP допускается «без отдела» */
  departmentUid: uuid('department_uid').references(() => departments.uid),
  name: text('name').notNull(),
  description: text('description')
});

export type InsertTeam = typeof teams.$inferInsert;
export type SelectTeam = typeof teams.$inferSelect;

/**
 * Связь команда ↔ проект (many-to-many).
 * Команда может вести несколько проектов; проект может принадлежать
 * нескольким командам (например, общая платформа).
 */
export const teamProjects = pgTable(
  'team_projects',
  {
    ...baseSchema,
    teamUid: uuid('team_uid')
      .references(() => teams.uid)
      .notNull(),
    projectUid: uuid('project_uid')
      .references(() => projects.uid)
      .notNull()
  },
  (t) => ({
    uniqueTeamProject: unique('uq_team_project').on(t.teamUid, t.projectUid)
  })
);

export type InsertTeamProject = typeof teamProjects.$inferInsert;
export type SelectTeamProject = typeof teamProjects.$inferSelect;

/**
 * Участники команды с per-team ролью (ВКР 2.2.7).
 * DEVELOPER — обычный участник; видит свои метрики в контексте команды.
 * LEAD      — тимлид этой команды; видит командные агрегаты, аномалии,
 *             но без раскрытия индивидуальных значений участников.
 *
 * Один пользователь может быть LEAD в одной команде и DEVELOPER в другой.
 * Глобальная роль (видимая на уровне всей системы) хранится в users.role.
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
    joinedAt: timestamp('joined_at').defaultNow().notNull()
  },
  (t) => ({
    uniqueMemberPerTeam: unique('uq_member_per_team').on(t.teamUid, t.userUid)
  })
);

export type InsertTeamMember = typeof teamMembers.$inferInsert;
export type SelectTeamMember = typeof teamMembers.$inferSelect;
