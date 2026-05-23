import { Buildings, Plus } from '@phosphor-icons/react';

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@shared/ui';

export default function AdminDepartmentsPage() {
  return (
    <div className='p-6 space-y-6'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-bold tracking-tight'>Отделы</h1>
          <p className='text-muted-foreground text-sm mt-1'>Управление структурой организации</p>
        </div>
        <Button className='gap-2'>
          <Plus size={16} />
          Создать отдел
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className='flex items-center gap-2'>
            <Buildings size={20} className='text-primary' weight='duotone' />
            <CardTitle>Список отделов</CardTitle>
          </div>
          <CardDescription>Раздел 7.5 — в разработке</CardDescription>
        </CardHeader>
        <CardContent>
          <p className='text-muted-foreground text-sm'>
            Здесь будет список отделов с командами, руководителями и статистикой.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
