import { relations } from 'drizzle-orm';

import { teams } from '../teams/schema';
import { users } from '../user/schema';
import { anomalySignals, auditLogs } from './schema';

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, {
    fields: [auditLogs.userUid],
    references: [users.uid]
  })
}));

export const anomalySignalsRelations = relations(anomalySignals, ({ one }) => ({
  team: one(teams, {
    fields: [anomalySignals.teamUid],
    references: [teams.uid]
  }),
  dismissedBy: one(users, {
    fields: [anomalySignals.dismissedByUserUid],
    references: [users.uid]
  })
}));
