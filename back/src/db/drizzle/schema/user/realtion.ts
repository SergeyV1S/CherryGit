import { relations } from 'drizzle-orm';

import { departments } from '../departments/schema';
import { commits, mergeRequests, mrReviews } from '../git-data/schema';
import { gitlabConnections, userGitlabIdentities } from '../gitlab/schema';
import { anomalySignals, auditLogs } from '../metrics/schema';
import { teamMembers } from '../teams/schema';
import { userProfle, users } from './schema';

export const userRelations = relations(users, ({ one, many }) => ({
  userProfleRelation: one(userProfle),
  department: one(departments, {
    fields: [users.departmentUid],
    references: [departments.uid]
  }),
  gitlabConnections: many(gitlabConnections),
  gitlabIdentities: many(userGitlabIdentities),
  teamMemberships: many(teamMembers),
  commits: many(commits),
  mergeRequests: many(mergeRequests),
  reviews: many(mrReviews),
  auditLogs: many(auditLogs),
  dismissedAnomalies: many(anomalySignals)
}));

export const userProfileRelations = relations(userProfle, ({ one }) => ({
  usersRelation: one(users, {
    fields: [userProfle.userUid],
    references: [users.uid]
  })
}));
