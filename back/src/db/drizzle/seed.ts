import bcrypt from 'bcrypt';
import { count, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import config from '../../config';
import { users } from './schema/user/schema';

import 'dotenv/config';

/**
 * Seed-скрипт: создаёт первого ADMIN, если в БД нет ни одного.
 *
 * Идемпотентен — повторный запуск не создаёт дубликаты.
 *
 * Настройка через env:
 *   SEED_ADMIN_MAIL     — почта первого администратора (default: admin@cherrygit.local)
 *   SEED_ADMIN_PASSWORD — пароль (default: Admin1234!)
 *   SEED_ADMIN_FIRST    — имя (default: Admin)
 *   SEED_ADMIN_LAST     — фамилия (default: CherryGit)
 *
 * Запуск: yarn seed
 * После запуска: войти через POST /api/auth/login с указанными credentials,
 * затем сменить пароль через POST /api/admin/users/:uid/password.
 */
const seed = async () => {
  const client = postgres(config.database.postgres.url, { max: 1 });
  const db = drizzle(client);

  try {
    // Проверяем наличие хотя бы одного ADMIN в системе.
    const [{ value: adminCount }] = await db
      .select({ value: count() })
      .from(users)
      .where(eq(users.role, 'ADMIN'));

    if (Number(adminCount) > 0) {
      console.log(`✅ Seed skipped: ${adminCount} ADMIN(s) already exist in the database.`);
      return;
    }

    const mail = process.env.SEED_ADMIN_MAIL ?? 'admin@cherrygit.local';
    const password = process.env.SEED_ADMIN_PASSWORD ?? 'Admin1234!';
    const firstName = process.env.SEED_ADMIN_FIRST ?? 'Admin';
    const secondName = process.env.SEED_ADMIN_LAST ?? 'CherryGit';

    const hashedPassword = await bcrypt.hash(password, 10);

    await db.insert(users).values({
      firstName,
      secondName,
      mail,
      password: hashedPassword,
      role: 'ADMIN',
      // ADMIN-seed создаётся как уже «активированный» — иначе auth-гейт
      // (provisioned_at IS NOT NULL OR role='ADMIN') пропустит его только
      // благодаря OR-ветке. Ставим явно, чтобы аккаунт выглядел консистентно.
      provisionedAt: new Date()
    });

    console.log('');
    console.log('🌱 CherryGit seed completed successfully!');
    console.log('');
    console.log('  First ADMIN created:');
    console.log(`    Email:    ${mail}`);
    console.log(`    Password: ${password}`);
    console.log('');
    console.log('  ⚠️  Change the password immediately after first login!');
    console.log('     POST /api/admin/users/:uid/password { "password": "NewSecurePass!" }');
    console.log('');
  } finally {
    await client.end();
  }
};

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  });
