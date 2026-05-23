import { Folders, Plus } from '@phosphor-icons/react';

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@shared/ui';

export default function AdminProjectsPage() {
  return (
    <div className='p-6 space-y-6'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-bold tracking-tight'>Проекты</h1>
          <p className='text-muted-foreground text-sm mt-1'>
            GitLab-проекты, подключённые к системе
          </p>
        </div>
        <Button className='gap-2'>
          <Plus size={16} />
          Подключить проект
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className='flex items-center gap-2'>
            <Folders size={20} className='text-primary' weight='duotone' />
            <CardTitle>Список проектов</CardTitle>
          </div>
          <CardDescription>Раздел 7.5 — в разработке</CardDescription>
        </CardHeader>
        <CardContent>
          <p className='text-muted-foreground text-sm'>
            Управление проектами: подключение, привязка к командам, настройка паттернов тегов и
            меток инцидентов.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
