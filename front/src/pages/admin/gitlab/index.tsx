import { GitBranch, Plus } from '@phosphor-icons/react';

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@shared/ui';

export default function AdminGitlabPage() {
  return (
    <div className='p-6 space-y-6'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-bold tracking-tight'>GitLab подключения</h1>
          <p className='text-muted-foreground text-sm mt-1'>
            Управление подключениями к GitLab-инстансам
          </p>
        </div>
        <Button className='gap-2'>
          <Plus size={16} />
          Добавить подключение
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className='flex items-center gap-2'>
            <GitBranch size={20} className='text-primary' weight='duotone' />
            <CardTitle>Подключения</CardTitle>
          </div>
          <CardDescription>Раздел 7.5 — в разработке</CardDescription>
        </CardHeader>
        <CardContent>
          <p className='text-muted-foreground text-sm'>
            Здесь будет управление GitLab-подключениями: создание, тестирование PAT-токена,
            просмотр статуса.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
