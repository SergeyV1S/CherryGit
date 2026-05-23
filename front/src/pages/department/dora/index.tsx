import { ArrowsClockwise, ChartLineUp, Lightning, Warning } from '@phosphor-icons/react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@shared/ui';

export default function DepartmentDoraPage() {
  return (
    <div className='p-6 space-y-6'>
      <div>
        <h1 className='text-2xl font-bold tracking-tight'>DORA-метрики отдела</h1>
        <p className='text-muted-foreground text-sm mt-1'>
          Кросс-командные показатели поставки и надёжности
        </p>
      </div>

      <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
        <Card>
          <CardHeader className='pb-2'>
            <div className='flex items-center gap-2'>
              <ChartLineUp size={18} className='text-primary' weight='duotone' />
              <CardTitle className='text-base'>Lead Time</CardTitle>
            </div>
            <CardDescription>Время от коммита до деплоя</CardDescription>
          </CardHeader>
          <CardContent>
            <p className='text-muted-foreground text-sm'>Раздел 7.4 — в разработке</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='pb-2'>
            <div className='flex items-center gap-2'>
              <Lightning size={18} className='text-primary' weight='duotone' />
              <CardTitle className='text-base'>Deployment Frequency</CardTitle>
            </div>
            <CardDescription>Частота деплоев в production</CardDescription>
          </CardHeader>
          <CardContent>
            <p className='text-muted-foreground text-sm'>Раздел 7.4 — в разработке</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='pb-2'>
            <div className='flex items-center gap-2'>
              <Warning size={18} className='text-primary' weight='duotone' />
              <CardTitle className='text-base'>Change Failure Rate</CardTitle>
            </div>
            <CardDescription>Доля деплоев с инцидентами</CardDescription>
          </CardHeader>
          <CardContent>
            <p className='text-muted-foreground text-sm'>Раздел 7.4 — в разработке</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='pb-2'>
            <div className='flex items-center gap-2'>
              <ArrowsClockwise size={18} className='text-primary' weight='duotone' />
              <CardTitle className='text-base'>Динамика</CardTitle>
            </div>
            <CardDescription>Сравнительный тренд команд</CardDescription>
          </CardHeader>
          <CardContent>
            <p className='text-muted-foreground text-sm'>Раздел 7.4 — в разработке</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
