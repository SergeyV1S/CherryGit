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
    <div className='page-shell'>
      {/* Header */}
      <div className='flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between'>
        <div className='min-w-0'>
          <h1 className='page-title'>Мои метрики</h1>
          <p className='page-subtitle text-balance'>
            Персональные показатели процесса разработки с командным baseline
          </p>
        </div>
        <PeriodSelector selected={periodDays} onChange={setPeriodDays} />
      </div>

      {/* No teams state */}
      {hasNoTeams && (
        <Card>
          <CardContent className='flex flex-col items-center gap-4 py-12 text-center'>
            <div
              className='flex h-16 w-16 items-center justify-center rounded-2xl text-white shadow-lg shadow-rose-900/20'
              style={{
                background:
                  'linear-gradient(135deg, oklch(0.78 0.22 22), oklch(0.45 0.22 18))'
              }}
            >
              <GitBranch size={28} weight='duotone' />
            </div>
            <div className='space-y-1'>
              <p className='font-semibold text-balance'>Вы не состоите ни в одной команде</p>
              <p className='text-sm text-muted-foreground text-balance'>
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
          <div className='flex items-start gap-3 rounded-xl border border-amber-300/60 bg-gradient-to-br from-amber-50 to-amber-100/40 px-4 py-3.5 shadow-sm dark:border-amber-900/50 dark:from-amber-900/20 dark:to-amber-900/10'>
            <Warning size={18} className='mt-0.5 shrink-0 text-amber-600' weight='fill' />
            <div className='min-w-0 space-y-0.5'>
              <p className='text-sm font-semibold text-amber-900 dark:text-amber-300'>
                GitLab-аккаунт не привязан
              </p>
              <p className='text-xs leading-relaxed text-amber-800/90 dark:text-amber-400/90 text-balance'>
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
          <CardContent className='flex flex-col items-center gap-2 py-10 text-center'>
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
              <div className='h-6 w-48 animate-pulse rounded-md bg-muted' />
              <div className='grid gap-5 md:grid-cols-2'>
                <div className='h-72 animate-pulse rounded-xl bg-muted' />
                <div className='h-72 animate-pulse rounded-xl bg-muted' />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty period */}
      {!isLoading && metrics && metrics.teams.length === 0 && !hasNoTeams && (
        <Card>
          <CardContent className='flex flex-col items-center gap-2 py-10 text-center'>
            <p className='font-semibold text-balance'>Нет данных за выбранный период</p>
            <p className='text-sm text-muted-foreground text-balance'>
              Попробуйте выбрать более длинный период или дождитесь синхронизации проектов
            </p>
          </CardContent>
        </Card>
      )}

      {!isLoading &&
        metrics?.teams.map((team) => {
          const membership = user?.teams.find((t) => t.uid === team.teamUid);
          return (
            <section key={team.teamUid} className='space-y-4'>
              {/* Team header */}
              <div className='flex flex-wrap items-center gap-2.5'>
                <span
                  aria-hidden
                  className='h-2 w-2 rounded-full shadow-sm'
                  style={{ background: 'oklch(0.55 0.21 22)' }}
                />
                <h2 className='text-lg font-semibold tracking-tight text-balance'>
                  {team.teamName}
                </h2>
                {membership && (
                  <Badge variant={membership.myRole === 'LEAD' ? 'default' : 'secondary'}>
                    {membership.myRole === 'LEAD' ? 'Тимлид' : 'Разработчик'}
                  </Badge>
                )}
              </div>

              {/* Metric cards */}
              <div className='grid gap-5 md:grid-cols-2'>
                <CycleTimeMrCard
                  personal={team.personal.cycle_time_mr}
                  baseline={team.baseline.cycle_time_mr}
                />
                <MrSizeCard personal={team.personal.mr_size} baseline={team.baseline.mr_size} />
              </div>
            </section>
          );
        })}

      {/* GitLab identities info */}
      {metrics && metrics.gitlabUsernames.length > 0 && (
        <div className='rounded-lg border border-border/60 bg-muted/40 px-4 py-3 text-xs text-muted-foreground text-balance'>
          Личные метрики посчитаны для аккаунтов GitLab:{' '}
          <span className='inline-flex flex-wrap gap-1.5'>
            {metrics.gitlabUsernames.map((u) => (
              <code
                key={u}
                className='rounded-md border border-primary/20 bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] text-primary'
              >
                @{u}
              </code>
            ))}
          </span>
        </div>
      )}

      <FormulaBlock entries={ME_FORMULAS} />
    </div>
  );
}
