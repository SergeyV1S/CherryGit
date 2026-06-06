import { relations } from 'drizzle-orm';

import { commits, deployments, mergeRequests } from '../git-data/schema';
import { teamProjects } from '../teams/schema';
import { users } from '../user/schema';
import {
  codeModules,
  gitlabAvailableProjects,
  gitlabConnections,
  gitlabRawPayloads,
  gitlabUsers,
  projectGitlabUsers,
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
  identities: many(userGitlabIdentities),
  availableProjects: many(gitlabAvailableProjects),
  gitlabUsers: many(gitlabUsers)
}));

export const gitlabAvailableProjectsRelations = relations(gitlabAvailableProjects, ({ one }) => ({
  gitlabConnection: one(gitlabConnections, {
    fields: [gitlabAvailableProjects.gitlabConnectionUid],
    references: [gitlabConnections.uid]
  }),
  connectedProject: one(projects, {
    fields: [gitlabAvailableProjects.connectedProjectUid],
    references: [projects.uid]
  })
}));

export const gitlabUsersRelations = relations(gitlabUsers, ({ one, many }) => ({
  gitlabConnection: one(gitlabConnections, {
    fields: [gitlabUsers.gitlabConnectionUid],
    references: [gitlabConnections.uid]
  }),
  mappedUser: one(users, {
    fields: [gitlabUsers.mappedUserUid],
    references: [users.uid]
  }),
  projectMemberships: many(projectGitlabUsers)
}));

export const projectGitlabUsersRelations = relations(projectGitlabUsers, ({ one }) => ({
  project: one(projects, {
    fields: [projectGitlabUsers.projectUid],
    references: [projects.uid]
  }),
  gitlabUser: one(gitlabUsers, {
    fields: [projectGitlabUsers.gitlabUserUid],
    references: [gitlabUsers.uid]
  })
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
