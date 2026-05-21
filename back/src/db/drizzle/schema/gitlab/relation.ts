import { relations } from 'drizzle-orm';

import { commits, deployments, mergeRequests } from '../git-data/schema';
import { teamProjects } from '../teams/schema';
import { users } from '../user/schema';
import {
  codeModules,
  gitlabConnections,
  gitlabRawPayloads,
  projects,
  syncStatuses,
  userGitlabIdentities
} from './schema';

export const gitlabConnectionsRelations = relations(gitlabConnections, ({ one, many }) => ({
  owner: one(users, {
    fields: [gitlabConnections.ownerUid],
    references: [users.uid]
  }),
  projects: many(projects),
  identities: many(userGitlabIdentities)
}));

export const userGitlabIdentitiesRelations = relations(userGitlabIdentities, ({ one }) => ({
  user: one(users, {
    fields: [userGitlabIdentities.userUid],
    references: [users.uid]
  }),
  gitlabConnection: one(gitlabConnections, {
    fields: [userGitlabIdentities.gitlabConnectionUid],
    references: [gitlabConnections.uid]
  })
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  gitlabConnection: one(gitlabConnections, {
    fields: [projects.gitlabConnectionUid],
    references: [gitlabConnections.uid]
  }),
  syncStatus: one(syncStatuses),
  teamProjects: many(teamProjects),
  commits: many(commits),
  mergeRequests: many(mergeRequests),
  deployments: many(deployments),
  codeModules: many(codeModules),
  rawPayloads: many(gitlabRawPayloads)
}));

export const syncStatusesRelations = relations(syncStatuses, ({ one }) => ({
  project: one(projects, {
    fields: [syncStatuses.projectUid],
    references: [projects.uid]
  })
}));

export const codeModulesRelations = relations(codeModules, ({ one }) => ({
  project: one(projects, {
    fields: [codeModules.projectUid],
    references: [projects.uid]
  })
}));

export const gitlabRawPayloadsRelations = relations(gitlabRawPayloads, ({ one }) => ({
  project: one(projects, {
    fields: [gitlabRawPayloads.projectUid],
    references: [projects.uid]
  })
}));
