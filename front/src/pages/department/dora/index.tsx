import { useState } from 'react';

import { useQuery } from '@tanstack/react-query';

import { doraApi } from '@shared/api/dora.api';
import { formatSeconds } from '@shared/lib/format';
import { cn } from '@shared/lib/utils';
import type {
  ChangeFailureRateValue,
  CrossTeamDoraTeam,
  DeploymentFrequencyValue,
  LeadTimeValue
} from '@shared/types';
import { Card, CardContent, CardHeader, CardTitle, FormulaBlock } from '@shared/ui';

const DORA_FORMULAS = [
  {
    name: 'Lead Time for Changes',
    formula: 'LT = deployedAt − MIN(commits.committedAt) по MR деплоя',
    description: 'Время от первого коммита до деплоя в продакшен. Медиана и 90-й перцентиль по деплоям за период.'
  },
  {
    name: 'Deployment Frequency',
    formula: 'DF = count(деплоев) / periodDays',
    description: 'Частота деплоев. Elite: >1/день, High: 1–7 дней, Medium: 7–30 дней, Low: >30 дней.',
    note: 'Деплои определяются по тегам GitLab с настраиваемым паттерном (например v*).'
  },
  {
    name: 'Change Failure Rate',
    formula: 'CFR = count(hotfix/revert деплоев) / count(всех деплоев) × 100%',
    description: 'Доля деплоев, потребовавших хотфикса или отката. Elite: ≤15%, High: ≤30%, Medium: ≤45%, Low: >45%.',
    note: 'Хотфиксы и откаты определяются по labels MR (configurable). Всегда показывается рядом с DF (парная метрика).'
  }
];

import { PeriodSelector } from '../../me/components/PeriodSelector';

function getPeriodDates(days: number): { periodStart: Date; periodEnd: Date } {
  const periodEnd = new Date();
  const periodStart = new Date();
  periodStart.setDate(periodStart.getDate() - days);
  return { periodStart, periodEnd };
}

const DF_CATEGORY_CONFIG: Record<
  string,
  { label: string; color: string; bg: string }
> = {
  elite: {
    label: 'Elite',
    color: 'text-green-600',
    bg: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-900/40'
  },
  high: {
    label: 'High',
    color: 'text-blue-600',
    bg: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-900/40'
  },
  medium: {
    label: 'Medium',
    color: 'text-yellow-600',
    bg: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-900/40'
  },
  low: {
    label: 'Low',
    color: 'text-red-600',
    bg: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-900/40'
  }
};

const CFR_CATEGORY_CONFIG: Record<string, { label: string; color: string }> = {
  elite: { label: 'Elite', color: 'text-green-600' },
  high: { label: 'High', color: 'text-blue-600' },
  medium: { label: 'Medium', color: 'text-yellow-600' },
  low: { label: 'Low', color: 'text-red-600' }
};

function LeadTimeCell({ value }: { value: LeadTimeValue | null }) {
  if (!value || value.sampleSize === 0)
    return <span className='text-muted-foreground text-sm'>—</span>;
  return (
    <div>
      <p className='font-semibold text-sm'>{formatSeconds(value.medianSeconds)}</p>
      <p className='text-xs text-muted-foreground'>p90: {formatSeconds(value.p90Seconds)}</p>
    </div>
  );
}

function DeployFrequencyCell({ value }: { value: DeploymentFrequencyValue | null }) {
  if (!value || value.count === 0)
    return <span className='text-muted-foreground text-sm'>—</span>;
  const cfg = DF_CATEGORY_CONFIG[value.category];
  return (
    <div>
      <p className='font-semibold text-sm'>{value.count} деплоев</p>
      {cfg && <span className={cn('text-xs font-medium', cfg.color)}>{cfg.label}</span>}
    </div>
  );
}

function ChangeFailureCell({ value }: { value: ChangeFailureRateValue | null }) {
  if (!value || value.totalDeploys === 0)
    return <span className='text-muted-foreground text-sm'>—</span>;
  const cfg = value.category ? CFR_CATEGORY_CONFIG[value.category] : null;
  return (
    <div>
      <p className='font-semibold text-sm'>{value.ratePercent}%</p>
      {cfg && <span className={cn('text-xs font-medium', cfg.color)}>{cfg.label}</span>}
    </div>
  );
}

function TeamDoraCard({ team }: { team: CrossTeamDoraTeam }) {
  const df = team.deploymentFrequency;
  const cfr = team.changeFailureRate;
  const dfCfg = df?.category ? DF_CATEGORY_CONFIG[df.category] : null;

  return (
    <Card>
      <CardHeader className='pb-2'>
        <div className='flex items-center justify-between gap-2'>
          <CardTitle className='text-base'>{team.teamName}</CardTitle>
          <span className='text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full'>
            {team.projectCount} проект
          </span>
        </div>
      </CardHeader>
      <CardContent className='space-y-3'>
        {/* Lead Time */}
        <div className='flex items-center justify-between'>
          <p className='text-sm text-muted-foreground'>Lead Time</p>
          <LeadTimeCell value={team.leadTime} />
        </div>

        {/* DF + CFR paired visualization (ВКР FR-06) */}
        <div className='rounded-lg border p-3 grid grid-cols-2 gap-3'>
          <div>
            <p className='text-xs text-muted-foreground mb-1'>Deploy Freq</p>
            {df && df.count > 0 ? (
              <>
                <p className='font-semibold text-sm'>{df.count}</p>
                {dfCfg && (
                  <span
                    className={cn(
                      'text-xs px-1.5 py-0.5 rounded border font-medium',
                      dfCfg.bg,
                      dfCfg.color
                    )}
                  >
                    {dfCfg.label}
                  </span>
                )}
              </>
            ) : (
              <span className='text-muted-foreground text-sm'>—</span>
            )}
          </div>
          <div>
            <p className='text-xs text-muted-foreground mb-1'>CFR</p>
            {cfr && cfr.totalDeploys > 0 ? (
              <>
                <p className='font-semibold text-sm'>{cfr.ratePercent}%</p>
                {cfr.category && (
                  <span
                    className={cn('text-xs font-medium', CFR_CATEGORY_CONFIG[cfr.category].color)}
                  >
                    {CFR_CATEGORY_CONFIG[cfr.category].label}
                  </span>
                )}
              </>
            ) : (
              <span className='text-muted-foreground text-sm'>—</span>
            )}
          </div>
        </div>

        {team.projectCount === 0 && (
          <p className='text-xs text-muted-foreground text-center'>Нет привязанных проектов</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function DepartmentDoraPage() {
  const [periodDays, setPeriodDays] = useState(90);

  const { periodStart, periodEnd } = getPeriodDates(periodDays);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['dora-cross-team', periodDays],
    queryFn: () => doraApi.getCrossTeamDora(periodStart, periodEnd)
  });

  return (
    <div className='p-6 space-y-6 max-w-6xl'>
      {/* Header */}
      <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3'>
        <div>
          <h1 className='text-2xl font-bold tracking-tight'>DORA-метрики отдела</h1>
          <p className='text-muted-foreground text-sm mt-1'>
            Кросс-командные показатели поставки и надёжности
          </p>
        </div>
        <PeriodSelector selected={periodDays} onChange={setPeriodDays} />
      </div>

      {/* DORA legend */}
      <div className='grid grid-cols-2 md:grid-cols-4 gap-2'>
        {Object.entries(DF_CATEGORY_CONFIG).map(([key, cfg]) => (
          <div key={key} className={cn('rounded-lg border px-3 py-2', cfg.bg)}>
            <p className={cn('text-sm font-semibold', cfg.color)}>{cfg.label}</p>
            <p className='text-xs text-muted-foreground'>
              {key === 'elite'
                ? 'несколько/день'
                : key === 'high'
                  ? 'день–неделя'
                  : key === 'medium'
                    ? 'неделя–месяц'
                    : 'реже месяца'}
            </p>
          </div>
        ))}
      </div>

      {/* Error */}
      {isError && (
        <Card>
          <CardContent className='py-8 text-center'>
            <p className='text-sm text-muted-foreground'>
              Не удалось загрузить DORA-метрики. Попробуйте обновить страницу.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Loading */}
      {isLoading && (
        <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
          {[1, 2, 3].map((i) => (
            <div key={i} className='h-48 bg-muted animate-pulse rounded-lg' />
          ))}
        </div>
      )}

      {/* No teams */}
      {!isLoading && data && data.teams.length === 0 && (
        <Card>
          <CardContent className='py-10 text-center space-y-2'>
            <p className='font-medium'>Нет команд в вашем отделе</p>
            <p className='text-sm text-muted-foreground'>
              Обратитесь к администратору для привязки команд к отделу
            </p>
          </CardContent>
        </Card>
      )}

      {/* Comparison table + cards */}
      {!isLoading && data && data.teams.length > 0 && (
        <>
          <div className='overflow-x-auto rounded-lg border'>
            <table className='w-full text-sm'>
              <thead>
                <tr className='bg-muted/50 text-left'>
                  <th className='px-4 py-2.5 font-medium'>Команда</th>
                  <th className='px-4 py-2.5 font-medium'>Lead Time</th>
                  <th className='px-4 py-2.5 font-medium'>Deploy Frequency</th>
                  <th className='px-4 py-2.5 font-medium'>Change Failure Rate</th>
                </tr>
              </thead>
              <tbody>
                {data.teams.map((team) => (
                  <tr key={team.teamUid} className='border-t hover:bg-muted/30 transition-colors'>
                    <td className='px-4 py-2 font-medium'>{team.teamName}</td>
                    <td className='px-4 py-2'>
                      <LeadTimeCell value={team.leadTime} />
                    </td>
                    <td className='px-4 py-2'>
                      <DeployFrequencyCell value={team.deploymentFrequency} />
                    </td>
                    <td className='px-4 py-2'>
                      <ChangeFailureCell value={team.changeFailureRate} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
            {data.teams.map((team) => (
              <TeamDoraCard key={team.teamUid} team={team} />
            ))}
          </div>

          <FormulaBlock entries={DORA_FORMULAS} />
        </>
      )}
    </div>
  );
}
