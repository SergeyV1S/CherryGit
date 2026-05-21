import { relations } from 'drizzle-orm';

import { users } from '../user/schema';
import { auditLogs } from './schema';

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, {
    fields: [auditLogs.userUid],
    references: [users.uid]
  })
}));
