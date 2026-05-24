import { Link } from 'react-router';

import { GitBranch, LockKey } from '@phosphor-icons/react';

import { ROUTES } from '@shared/constants';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@shared/ui';

/**
 * Открытая регистрация отключена в новом флоу — аккаунты создаются автоматически
 * при подключении проекта администратором. Страница оставлена для совместимости
 * с роутом /register, чтобы не было битой ссылки из шапки login-страницы.
 */
export default function RegisterPage() {
  return (
    <div className='relative flex min-h-screen items-center justify-center overflow-hidden p-4'>
      <div
        aria-hidden
        className='pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full opacity-60 blur-3xl'
        style={{ background: 'oklch(0.78 0.20 22 / 0.5)' }}
      />
      <div
        aria-hidden
        className='pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full opacity-50 blur-3xl'
        style={{ background: 'oklch(0.55 0.21 22 / 0.4)' }}
      />

      <div className='relative w-full max-w-sm'>
        <div className='mb-8 flex flex-col items-center gap-3 text-center'>
          <div
            className='flex h-14 w-14 items-center justify-center rounded-2xl shadow-xl shadow-rose-900/30'
            style={{
              background:
                'linear-gradient(135deg, oklch(0.78 0.22 22) 0%, oklch(0.45 0.22 18) 100%)'
            }}
          >
            <GitBranch size={28} weight='bold' className='text-white drop-shadow' />
          </div>
          <h1 className='page-title text-3xl'>CherryGit</h1>
        </div>

        <Card>
          <CardHeader className='pb-3 text-center'>
            <div
              className='mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg shadow-rose-900/20'
              style={{
                background:
                  'linear-gradient(135deg, oklch(0.78 0.22 22) 0%, oklch(0.45 0.22 18) 100%)'
              }}
            >
              <LockKey size={24} weight='duotone' />
            </div>
            <CardTitle className='text-xl'>Регистрация недоступна</CardTitle>
            <CardDescription className='text-balance'>
              Аккаунты создаются автоматически при подключении GitLab-проекта администратором.
              Если вас ещё нет в системе — обратитесь к нему.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild size='lg' className='w-full'>
              <Link to={ROUTES.login}>Перейти ко входу</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
