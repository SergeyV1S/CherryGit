import { relations } from 'drizzle-orm';

import { projects } from '../gitlab/schema';
import { users } from '../user/schema';
import { teamMembers, teams } from './schema';

export const teamsRelations = relations(teams, ({ one, many }) => ({
  project: one(projects, {
    fields: [teams.projectUid],
    references: [projects.uid]
  }),
  members: many(teamMembers)
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
