import { relations } from 'drizzle-orm';

import { departments } from '../departments/schema';
import { projects } from '../gitlab/schema';
import { users } from '../user/schema';
import { teamMembers, teamProjects, teams } from './schema';

export const teamsRelations = relations(teams, ({ one, many }) => ({
  department: one(departments, {
    fields: [teams.departmentUid],
    references: [departments.uid]
  }),
  teamProjects: many(teamProjects),
  members: many(teamMembers)
}));

export const teamProjectsRelations = relations(teamProjects, ({ one }) => ({
  team: one(teams, {
    fields: [teamProjects.teamUid],
    references: [teams.uid]
  }),
  project: one(projects, {
    fields: [teamProjects.projectUid],
    references: [projects.uid]
  })
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  team: one(teams, {
    fields: [teamMembers.teamUid],
    references: [teams.uid]
  }),
  user: one(users, {
    fields: [teamMembers.userUid],
    references: [users.uid]
  })
}));
