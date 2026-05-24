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
    <div className='bg-muted/40 flex min-h-screen items-center justify-center p-4'>
      <div className='w-full max-w-sm'>
        <div className='mb-6 flex flex-col items-center gap-2'>
          <div className='from-primary to-primary/60 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br shadow-md'>
            <GitBranch size={20} weight='bold' className='text-primary-foreground' />
          </div>
          <span className='text-xl font-bold tracking-tight'>CherryGit</span>
        </div>

        <Card>
          <CardHeader className='pb-4 text-center'>
            <div className='bg-muted mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full'>
              <LockKey size={22} className='text-muted-foreground' weight='duotone' />
            </div>
            <CardTitle className='text-lg'>Регистрация недоступна</CardTitle>
            <CardDescription>
              Аккаунты создаются автоматически при подключении GitLab-проекта администратором.
              Если вас ещё нет в системе — обратитесь к нему.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className='w-full'>
              <Link to={ROUTES.login}>Перейти ко входу</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
