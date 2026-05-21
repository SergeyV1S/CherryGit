import { relations } from 'drizzle-orm';

import { projects } from '../gitlab/schema';
import { users } from '../user/schema';
import { commits, deployments, mergeRequests, mrCommits, mrReviews } from './schema';

export const commitsRelations = relations(commits, ({ one, many }) => ({
  project: one(projects, {
    fields: [commits.projectUid],
    references: [projects.uid]
  }),
  author: one(users, {
    fields: [commits.authorUid],
    references: [users.uid]
  }),
  mrCommits: many(mrCommits)
}));

export const mergeRequestsRelations = relations(mergeRequests, ({ one, many }) => ({
  project: one(projects, {
    fields: [mergeRequests.projectUid],
    references: [projects.uid]
  }),
  author: one(users, {
    fields: [mergeRequests.authorUid],
    references: [users.uid]
  }),
  reviews: many(mrReviews),
  mrCommits: many(mrCommits),
  deployments: many(deployments)
}));

export const mrCommitsRelations = relations(mrCommits, ({ one }) => ({
  mergeRequest: one(mergeRequests, {
    fields: [mrCommits.mergeRequestUid],
    references: [mergeRequests.uid]
  }),
  commit: one(commits, {
    fields: [mrCommits.commitUid],
    references: [commits.uid]
  })
}));

export const mrReviewsRelations = relations(mrReviews, ({ one }) => ({
  mergeRequest: one(mergeRequests, {
    fields: [mrReviews.mergeRequestUid],
    references: [mergeRequests.uid]
  }),
  reviewer: one(users, {
    fields: [mrReviews.reviewerUid],
    references: [users.uid]
  })
}));

export const deploymentsRelations = relations(deployments, ({ one }) => ({
  project: one(projects, {
    fields: [deployments.projectUid],
    references: [projects.uid]
  }),
  mergeRequest: one(mergeRequests, {
    fields: [deployments.mergeRequestUid],
    references: [mergeRequests.uid]
  })
}));
