import { relations } from 'drizzle-orm';

import { commits, deployments, mergeRequests } from '../git-data/schema';
import { teams } from '../teams/schema';
import { users } from '../user/schema';
import { gitlabConnections, projects, syncStatuses } from './schema';

export const gitlabConnectionsRelations = relations(gitlabConnections, ({ one, many }) => ({
  owner: one(users, {
    fields: [gitlabConnections.ownerUid],
    references: [users.uid]
  }),
  projects: many(projects)
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  gitlabConnection: one(gitlabConnections, {
    fields: [projects.gitlabConnectionUid],
    references: [gitlabConnections.uid]
  }),
  syncStatus: one(syncStatuses),
  teams: many(teams),
  commits: many(commits),
  mergeRequests: many(mergeRequests),
  deployments: many(deployments)
}));

export const syncStatusesRelations = relations(syncStatuses, ({ one }) => ({
  project: one(projects, {
    fields: [syncStatuses.projectUid],
    references: [projects.uid]
  })
}));
