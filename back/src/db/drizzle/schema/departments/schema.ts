import { pgTable, text } from 'drizzle-orm/pg-core';

import { baseSchema } from '../base.schema';

/**
 * Отдел разработки. Группирует команды для руководителя отдела (роль HEAD).
 * В минимальной конфигурации MVP допускается единственный отдел.
 */
export const departments = pgTable('departments', {
  ...baseSchema,
  name: text('name').notNull(),
  description: text('description')
});

export type InsertDepartment = typeof departments.$inferInsert;
export type SelectDepartment = typeof departments.$inferSelect;
