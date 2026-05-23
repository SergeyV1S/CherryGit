import { ChartLineUp } from '@phosphor-icons/react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@shared/ui';

export default function DepartmentTrendPage() {
  return (
    <div className='p-6 space-y-6'>
      <div>
        <h1 className='text-2xl font-bold tracking-tight'>Динамика команд</h1>
        <p className='text-muted-foreground text-sm mt-1'>
          Сравнительная динамика DORA-метрик по командам отдела
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className='flex items-center gap-2'>
            <ChartLineUp size={20} className='text-primary' weight='duotone' />
            <CardTitle>График тренда</CardTitle>
          </div>
          <CardDescription>Раздел 7.4 — в разработке</CardDescription>
        </CardHeader>
        <CardContent>
          <p className='text-muted-foreground text-sm'>
            Здесь будет визуализация динамики DORA-метрик по командам отдела во времени.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
