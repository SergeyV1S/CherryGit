import { timestamp, uuid } from 'drizzle-orm/pg-core';

export const baseSchema = {
  uid: uuid('uid').defaultRandom().primaryKey().notNull(),
  createdAt: timestamp('created_at', { withTimezone: false }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: false })
    .$onUpdate(() => new Date())
    .notNull()
};
