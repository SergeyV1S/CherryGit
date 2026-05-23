import { useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import { GitBranch, Warning } from '@phosphor-icons/react';

import { meApi } from '@shared/api/me.api';
import { useAuth } from '@shared/hooks';
import { Badge, Card, CardContent, FormulaBlock } from '@shared/ui';

const ME_FORMULAS = [
  {
    name: 'Cycle Time MR — медиана',
    formula: 'median(closedAt − createdAt) по merged MR за период',
    description: 'Время жизни MR от открытия до мержа. Личное значение сравнивается с командным baseline.',
    note: 'Черновики (draft) исключаются из выборки.'
  },
  {
    name: 'Фазы Cycle Time',
    formula: 'Фаза 1: firstReviewAt − createdAt | Фаза 2: approvedAt − firstReviewAt | Фаза 3: mergedAt − approvedAt',
    description: 'Декомпозиция времени ожидания по фазам жизненного цикла MR.'
  },
  {
    name: 'MR Size — распределение',
    formula: 'Бакеты по linesChanged: ≤50, 51–200, 201–400, 401–800, >800',
    description: 'Распределение MR по суммарному количеству изменённых строк (additions + deletions).'
  }
];

import { CycleTimeMrCard } from './components/CycleTimeMrCard';
import { MrSizeCard } from './components/MrSizeCard';
import { PeriodSelector } from './components/PeriodSelector';

function getPeriodDates(days: number): { periodStart: Date; periodEnd: Date } {
  const periodEnd = new Date();
  const periodStart = new Date();
  periodStart.setDate(periodStart.getDate() - days);
  return { periodStart, periodEnd };
}

export default function MePage() {
  const { user } = useAuth();
  const [periodDays, setPeriodDays] = useState(30);

  const { periodStart, periodEnd } = getPeriodDates(periodDays);

  const {
    data: metrics,
    isLoading,
    isError
  } = useQuery({
    queryKey: ['me-metrics', periodDays],
    queryFn: () => meApi.getMyMetrics(periodStart, periodEnd),
    enabled: !!user
  });

  const hasNoTeams = !user?.teams || user.teams.length === 0;

  return (
    <div className='p-6 space-y-6 max-w-5xl'>
      {/* Header */}
      <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3'>
        <div>
          <h1 className='text-2xl font-bold tracking-tight'>Мои метрики</h1>
          <p className='text-muted-foreground text-sm mt-1'>
            Персональные показатели процесса разработки
          </p>
        </div>
        <PeriodSelector selected={periodDays} onChange={setPeriodDays} />
      </div>

      {/* No teams state */}
      {hasNoTeams && (
        <Card>
          <CardContent className='flex flex-col items-center gap-3 py-10 text-center'>
            <GitBranch size={40} className='text-muted-foreground' weight='duotone' />
            <div>
              <p className='font-medium'>Вы не состоите ни в одной команде</p>
              <p className='text-sm text-muted-foreground mt-1'>
                Обратитесь к администратору системы для добавления в команду
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* GitLab identity hint */}
      {!hasNoTeams &&
        user?.gitlabIdentities &&
        user.gitlabIdentities.length === 0 && (
          <div className='flex items-start gap-2 rounded-lg border border-yellow-200 bg-yellow-50 dark:border-yellow-900/50 dark:bg-yellow-900/20 px-4 py-3'>
            <Warning size={16} className='text-yellow-600 mt-0.5 shrink-0' weight='fill' />
            <div>
              <p className='text-sm font-medium text-yellow-800 dark:text-yellow-400'>
                GitLab-аккаунт не привязан
              </p>
              <p className='text-xs text-yellow-700 dark:text-yellow-500 mt-0.5'>
                Личные метрики показывают только MR, у которых аккаунт GitLab совпадает с вашей
                корпоративной почтой. Попросите администратора привязать ваш GitLab-аккаунт для
                точных данных.
              </p>
            </div>
          </div>
        )}

      {/* Error state */}
      {isError && (
        <Card>
          <CardContent className='flex flex-col items-center gap-2 py-8 text-center'>
            <p className='text-sm text-muted-foreground'>
              Не удалось загрузить метрики. Попробуйте обновить страницу.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className='space-y-6'>
          {(user?.teams ?? []).map((team) => (
            <div key={team.uid} className='space-y-3'>
              <div className='h-5 w-48 bg-muted animate-pulse rounded' />
              <div className='grid gap-4 md:grid-cols-2'>
                <div className='h-72 bg-muted animate-pulse rounded-lg' />
                <div className='h-72 bg-muted animate-pulse rounded-lg' />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Metrics by team */}
      {!isLoading && metrics && metrics.teams.length === 0 && !hasNoTeams && (
        <Card>
          <CardContent className='flex flex-col items-center gap-2 py-8 text-center'>
            <p className='font-medium'>Нет данных за выбранный период</p>
            <p className='text-sm text-muted-foreground'>
              Попробуйте выбрать более длинный период или дождитесь синхронизации проектов
            </p>
          </CardContent>
        </Card>
      )}

      {!isLoading &&
        metrics?.teams.map((team) => {
          const membership = user?.teams.find((t) => t.uid === team.teamUid);
          return (
            <div key={team.teamUid} className='space-y-3'>
              {/* Team header */}
              <div className='flex items-center gap-2'>
                <h2 className='text-lg font-semibold'>{team.teamName}</h2>
                {membership && (
                  <Badge variant={membership.myRole === 'LEAD' ? 'success' : 'secondary'}>
                    {membership.myRole === 'LEAD' ? 'Тимлид' : 'Разработчик'}
                  </Badge>
                )}
              </div>

              {/* Metric cards */}
              <div className='grid gap-4 md:grid-cols-2'>
                <CycleTimeMrCard
                  personal={team.personal.cycle_time_mr}
                  baseline={team.baseline.cycle_time_mr}
                />
                <MrSizeCard personal={team.personal.mr_size} baseline={team.baseline.mr_size} />
              </div>
            </div>
          );
        })}

      {/* GitLab identities info */}
      {metrics && metrics.gitlabUsernames.length > 0 && (
        <p className='text-xs text-muted-foreground'>
          Личные метрики посчитаны для аккаунтов GitLab:{' '}
          {metrics.gitlabUsernames.map((u) => <code key={u} className='bg-muted px-1 rounded'>{u}</code>).reduce(
            (acc, el, i) => (i === 0 ? [el] : [...acc, ', ', el]),
            [] as React.ReactNode[]
          )}
        </p>
      )}

      <FormulaBlock entries={ME_FORMULAS} />
    </div>
  );
}
