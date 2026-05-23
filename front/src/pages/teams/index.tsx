import { ChartLineUp, Clock, Tree } from '@phosphor-icons/react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@shared/ui';

export default function TeamsPage() {
  return (
    <div className='p-6 space-y-6'>
      <div>
        <h1 className='text-2xl font-bold tracking-tight'>Дашборд команды</h1>
        <p className='text-muted-foreground text-sm mt-1'>
          Командные метрики разработки
        </p>
      </div>

      <div className='grid gap-4 md:grid-cols-3'>
        <Card>
          <CardHeader className='pb-2'>
            <div className='flex items-center gap-2'>
              <Clock size={18} className='text-primary' weight='duotone' />
              <CardTitle className='text-base'>Cycle Time MR</CardTitle>
            </div>
            <CardDescription>Декомпозиция времени по фазам</CardDescription>
          </CardHeader>
          <CardContent>
            <p className='text-muted-foreground text-sm'>Раздел 7.3 — в разработке</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='pb-2'>
            <div className='flex items-center gap-2'>
              <Tree size={18} className='text-primary' weight='duotone' />
              <CardTitle className='text-base'>Bus Factor</CardTitle>
            </div>
            <CardDescription>Зависимость от ключевых участников</CardDescription>
          </CardHeader>
          <CardContent>
            <p className='text-muted-foreground text-sm'>Раздел 7.3 — в разработке</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='pb-2'>
            <div className='flex items-center gap-2'>
              <ChartLineUp size={18} className='text-primary' weight='duotone' />
              <CardTitle className='text-base'>Размер MR</CardTitle>
            </div>
            <CardDescription>Распределение по объёму</CardDescription>
          </CardHeader>
          <CardContent>
            <p className='text-muted-foreground text-sm'>Раздел 7.3 — в разработке</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
