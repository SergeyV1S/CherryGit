import { relations } from 'drizzle-orm';

import { commits, mergeRequests, mrReviews } from '../git-data/schema';
import { gitlabConnections } from '../gitlab/schema';
import { files, images } from '../media/schema';
import { auditLogs } from '../metrics/schema';
import { teamMembers } from '../teams/schema';
import { userProfle, users } from './schema';

export const userRelations = relations(users, ({ one, many }) => ({
  userProfleRelation: one(userProfle),
  imagesRelation: many(images),
  fileRelation: many(files),
  gitlabConnections: many(gitlabConnections),
  teamMemberships: many(teamMembers),
  commits: many(commits),
  mergeRequests: many(mergeRequests),
  reviews: many(mrReviews),
  auditLogs: many(auditLogs)
}));

export const userProfileRelations = relations(userProfle, ({ one }) => ({
  usersRelation: one(users, {
    fields: [userProfle.userUid],
    references: [users.uid]
  })
}));
