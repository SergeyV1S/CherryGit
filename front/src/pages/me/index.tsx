import { ChartBar, Clock, CodeBlock } from '@phosphor-icons/react';

import { useAuth } from '@shared/hooks';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@shared/ui';

export default function MePage() {
  const { user } = useAuth();

  return (
    <div className='p-6 space-y-6'>
      <div>
        <h1 className='text-2xl font-bold tracking-tight'>Мои метрики</h1>
        <p className='text-muted-foreground text-sm mt-1'>
          Персональные показатели процесса разработки
        </p>
      </div>

      <div className='grid gap-4 md:grid-cols-3'>
        <Card>
          <CardHeader className='pb-2'>
            <div className='flex items-center gap-2'>
              <Clock size={18} className='text-primary' weight='duotone' />
              <CardTitle className='text-base'>Cycle Time MR</CardTitle>
            </div>
            <CardDescription>Время жизни merge request'а</CardDescription>
          </CardHeader>
          <CardContent>
            <p className='text-muted-foreground text-sm'>
              Раздел 7.2 — реализуется в следующем итерации
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='pb-2'>
            <div className='flex items-center gap-2'>
              <CodeBlock size={18} className='text-primary' weight='duotone' />
              <CardTitle className='text-base'>Размер MR</CardTitle>
            </div>
            <CardDescription>Распределение по объёму изменений</CardDescription>
          </CardHeader>
          <CardContent>
            <p className='text-muted-foreground text-sm'>
              Раздел 7.2 — реализуется в следующем итерации
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='pb-2'>
            <div className='flex items-center gap-2'>
              <ChartBar size={18} className='text-primary' weight='duotone' />
              <CardTitle className='text-base'>Командный baseline</CardTitle>
            </div>
            <CardDescription>Сравнение с командой</CardDescription>
          </CardHeader>
          <CardContent>
            <p className='text-muted-foreground text-sm'>
              Раздел 7.2 — реализуется в следующем итерации
            </p>
          </CardContent>
        </Card>
      </div>

      {user?.teams && user.teams.length > 0 && (
        <div>
          <h2 className='text-lg font-semibold mb-3'>Мои команды</h2>
          <div className='flex flex-wrap gap-2'>
            {user.teams.map((team) => (
              <Badge key={team.uid} variant='secondary' className='text-sm px-3 py-1'>
                {team.name} · {team.myRole === 'LEAD' ? 'Тимлид' : 'Разработчик'}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
