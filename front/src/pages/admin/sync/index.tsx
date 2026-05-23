import { ArrowsClockwise, CheckCircle, Warning } from '@phosphor-icons/react';

import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@shared/ui';

export default function AdminSyncPage() {
  return (
    <div className='p-6 space-y-6'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-bold tracking-tight'>Синхронизация</h1>
          <p className='text-muted-foreground text-sm mt-1'>
            Статус синхронизации данных из GitLab
          </p>
        </div>
        <Button variant='outline' className='gap-2'>
          <ArrowsClockwise size={16} />
          Запустить синхронизацию
        </Button>
      </div>

      <div className='grid gap-4 md:grid-cols-3'>
        <Card>
          <CardHeader className='pb-2'>
            <div className='flex items-center justify-between'>
              <CardTitle className='text-base'>Планировщик</CardTitle>
              <Badge variant='success'>Активен</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <p className='text-muted-foreground text-sm'>Интервал: 10 минут</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='pb-2'>
            <div className='flex items-center gap-2'>
              <CheckCircle size={18} className='text-emerald-500' weight='fill' />
              <CardTitle className='text-base'>Последний запуск</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className='text-muted-foreground text-sm'>Раздел 7.5 — в разработке</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='pb-2'>
            <div className='flex items-center gap-2'>
              <Warning size={18} className='text-amber-500' weight='fill' />
              <CardTitle className='text-base'>Ошибки</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className='text-muted-foreground text-sm'>Раздел 7.5 — в разработке</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>История синхронизаций</CardTitle>
          <CardDescription>Раздел 7.5 — в разработке</CardDescription>
        </CardHeader>
        <CardContent>
          <p className='text-muted-foreground text-sm'>
            Здесь будет таблица с историей запусков sync по каждому проекту.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
