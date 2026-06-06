import { useState } from 'react';

import { useQuery } from '@tanstack/react-query';

import { doraApi } from '@shared/api/dora.api';
import { formatSeconds } from '@shared/lib/format';
import { cn } from '@shared/lib/utils';
import type { CrossTeamDoraTeam, DeploymentFrequencyCategory } from '@shared/types';
import { Card, CardContent, CardHeader, CardTitle, FormulaTooltip } from '@shared/ui';
import type { FormulaEntry } from '@shared/ui';

const TREND_FORMULAS: FormulaEntry[] = [
  {
    name: 'Lead Time for Changes',
    formula: 'median(deployedAt − MIN(commits.committedAt)) по деплоям за период',
    description:
      'Время от первого коммита до деплоя. Чем меньше — тем быстрее команда доставляет изменения.'
  },
  {
    name: 'Deployment Frequency',
    formula: 'count(деплоев) / periodDays',
    description:
      'Частота деплоев за период. Elite: >1/день, High: день–неделя, Medium: неделя–месяц, Low: реже.'
  },
  {
    name: 'Change Failure Rate',
    formula: 'count(hotfix/revert) / count(всех деплоев) × 100%',
    description:
      'Нижнее значение CFR — лучше. Метрика качества, всегда показывается рядом с Deployment Frequency.'
  }
];

import { PeriodSelector } from '../../me/components/PeriodSelector';

function getPeriodDates(days: number): { periodStart: Date; periodEnd: Date } {
  const periodEnd = new Date();
  const periodStart = new Date();
  periodStart.setDate(periodStart.getDate() - days);
  return { periodStart, periodEnd };
}

const CATEGORY_COLOR: Record<DeploymentFrequencyCategory, string> = {
  elite: 'text-green-600 bg-green-100 dark:bg-green-900/30',
  high: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30',
  medium: 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30',
  low: 'text-red-600 bg-red-100 dark:bg-red-900/30'
};

const CATEGORY_LABEL: Record<DeploymentFrequencyCategory, string> = {
  elite: 'Elite',
  high: 'High',
  medium: 'Medium',
  low: 'Low'
};

interface TrendRowProps {
  team: CrossTeamDoraTeam;
}

function TrendRow({ team }: TrendRowProps) {
  const df = team.deploymentFrequency;
  const cfr = team.changeFailureRate;
  const lt = team.leadTime;

  const dfCat = df?.category as DeploymentFrequencyCategory | undefined;
  const cfrCat = cfr?.category as DeploymentFrequencyCategory | null | undefined;

  return (
    <tr className='border-t hover:bg-muted/30 transition-colors'>
      <td className='px-4 py-3 font-medium'>{team.teamName}</td>
      <td className='px-4 py-3 text-sm'>
        {lt && lt.sampleSize > 0 ? (
          <div>
            <span className='font-medium'>{formatSeconds(lt.medianSeconds)}</span>
            <span className='text-muted-foreground text-xs ml-1'>
              (p90: {formatSeconds(lt.p90Seconds)})
            </span>
          </div>
        ) : (
          <span className='text-muted-foreground'>—</span>
        )}
      </td>
      <td className='px-4 py-3'>
        {df && df.count > 0 && dfCat ? (
          <div className='flex items-center gap-2'>
            <span className='text-sm font-medium'>{df.count}</span>
            <span
              className={cn('text-xs px-1.5 py-0.5 rounded font-medium', CATEGORY_COLOR[dfCat])}
            >
              {CATEGORY_LABEL[dfCat]}
            </span>
          </div>
        ) : (
          <span className='text-muted-foreground text-sm'>—</span>
        )}
      </td>
      <td className='px-4 py-3'>
        {cfr && cfr.totalDeploys > 0 ? (
          <div className='flex items-center gap-2'>
            <span className='text-sm font-medium'>{cfr.ratePercent}%</span>
            {cfrCat && (
              <span
                className={cn(
                  'text-xs px-1.5 py-0.5 rounded font-medium',
                  CATEGORY_COLOR[cfrCat]
                )}
              >
                {CATEGORY_LABEL[cfrCat]}
              </span>
            )}
          </div>
        ) : (
          <span className='text-muted-foreground text-sm'>—</span>
        )}
      </td>
    </tr>
  );
}

export default function DepartmentTrendPage() {
  const [periodDays, setPeriodDays] = useState(90);

  const { periodStart, periodEnd } = getPeriodDates(periodDays);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['dora-trend', periodDays],
    queryFn: () => doraApi.getCrossTeamDora(periodStart, periodEnd)
  });

  return (
    <div className='page-shell'>
      {/* Header */}
      <div className='flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between'>
        <div className='min-w-0'>
          <h1 className='page-title'>Динамика команд</h1>
          <p className='page-subtitle text-balance'>
            Сравнительный обзор DORA-показателей по командам отдела
          </p>
        </div>
        <PeriodSelector selected={periodDays} onChange={setPeriodDays} />
      </div>

      {isError && (
        <Card>
          <CardContent className='py-8 text-center'>
            <p className='text-sm text-muted-foreground'>
              Не удалось загрузить данные. Попробуйте обновить страницу.
            </p>
          </CardContent>
        </Card>
      )}

      {isLoading && (
        <div className='h-64 bg-muted animate-pulse rounded-lg' />
      )}

      {!isLoading && data && data.teams.length === 0 && (
        <Card>
          <CardContent className='py-10 text-center'>
            <p className='font-medium'>Нет команд в вашем отделе</p>
            <p className='text-sm text-muted-foreground mt-1'>
              Обратитесь к администратору для привязки команд к отделу
            </p>
          </CardContent>
        </Card>
      )}

      {!isLoading && data && data.teams.length > 0 && (
        <>
          {/* Comparison table */}
          <Card>
            <CardHeader className='pb-2'>
              <div className='flex items-center justify-between gap-2'>
                <CardTitle className='text-base'>Сравнение команд за период</CardTitle>
                <FormulaTooltip entries={TREND_FORMULAS} />
              </div>
            </CardHeader>
            <CardContent className='p-0'>
              <div className='overflow-x-auto'>
                <table className='w-full text-sm'>
                  <thead>
                    <tr className='bg-muted/50 text-left'>
                      <th className='px-4 py-2.5 font-medium'>Команда</th>
                      <th className='px-4 py-2.5 font-medium'>Lead Time</th>
                      <th className='px-4 py-2.5 font-medium'>Deploy Freq</th>
                      <th className='px-4 py-2.5 font-medium'>CFR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.teams.map((team) => (
                      <TrendRow key={team.teamUid} team={team} />
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Summary insights */}
          <div className='grid gap-3 sm:grid-cols-3'>
            <Card className='border-green-200 dark:border-green-900/40'>
              <CardContent className='py-4'>
                <p className='text-xs text-muted-foreground mb-1'>Лучший Lead Time</p>
                <p className='font-semibold'>
                  {(() => {
                    const best = data.teams
                      .filter((t) => t.leadTime && t.leadTime.medianSeconds != null)
                      .sort(
                        (a, b) =>
                          (a.leadTime!.medianSeconds ?? Infinity) -
                          (b.leadTime!.medianSeconds ?? Infinity)
                      )[0];
                    return best
                      ? `${best.teamName}: ${formatSeconds(best.leadTime?.medianSeconds ?? null)}`
                      : '—';
                  })()}
                </p>
              </CardContent>
            </Card>
            <Card className='border-blue-200 dark:border-blue-900/40'>
              <CardContent className='py-4'>
                <p className='text-xs text-muted-foreground mb-1'>Наибольшая частота деплоев</p>
                <p className='font-semibold'>
                  {(() => {
                    const best = data.teams
                      .filter((t) => t.deploymentFrequency && t.deploymentFrequency.count > 0)
                      .sort(
                        (a, b) =>
                          (b.deploymentFrequency?.perDay ?? 0) -
                          (a.deploymentFrequency?.perDay ?? 0)
                      )[0];
                    return best
                      ? `${best.teamName}: ${best.deploymentFrequency?.count}`
                      : '—';
                  })()}
                </p>
              </CardContent>
            </Card>
            <Card className='border-red-200 dark:border-red-900/40'>
              <CardContent className='py-4'>
                <p className='text-xs text-muted-foreground mb-1'>Наименьший CFR</p>
                <p className='font-semibold'>
                  {(() => {
                    const best = data.teams
                      .filter((t) => t.changeFailureRate && t.changeFailureRate.totalDeploys > 0)
                      .sort(
                        (a, b) =>
                          (a.changeFailureRate?.ratePercent ?? Infinity) -
                          (b.changeFailureRate?.ratePercent ?? Infinity)
                      )[0];
                    return best
                      ? `${best.teamName}: ${best.changeFailureRate?.ratePercent}%`
                      : '—';
                  })()}
                </p>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
