import { UserPlus, Users } from '@phosphor-icons/react';

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@shared/ui';

export default function AdminUsersPage() {
  return (
    <div className='p-6 space-y-6'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-bold tracking-tight'>Пользователи</h1>
          <p className='text-muted-foreground text-sm mt-1'>
            Управление учётными записями в системе
          </p>
        </div>
        <Button className='gap-2'>
          <UserPlus size={16} />
          Добавить пользователя
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className='flex items-center gap-2'>
            <Users size={20} className='text-primary' weight='duotone' />
            <CardTitle>Список пользователей</CardTitle>
          </div>
          <CardDescription>Раздел 7.5 — в разработке</CardDescription>
        </CardHeader>
        <CardContent>
          <p className='text-muted-foreground text-sm'>
            Здесь будет список всех пользователей системы с возможностью управления ролями,
            сброса паролей и привязки GitLab-аккаунтов.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
