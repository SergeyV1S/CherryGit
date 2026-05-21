import { relations } from 'drizzle-orm';

import { teams } from '../teams/schema';
import { users } from '../user/schema';
import { departments } from './schema';

export const departmentsRelations = relations(departments, ({ many }) => ({
  teams: many(teams),
  heads: many(users)
}));
