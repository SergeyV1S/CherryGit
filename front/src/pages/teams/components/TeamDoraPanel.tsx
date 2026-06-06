import { useQuery } from '@tanstack/react-query';
import { Gauge, Rocket, Warning } from '@phosphor-icons/react';

import { teamsApi } from '@shared/api/teams.api';
import { formatSeconds } from '@shared/lib/format';
import { cn } from '@shared/lib/utils';
import type {
  ChangeFailureRateValue,
  DeploymentFrequencyCategory,
  DeploymentFrequencyValue,
  LeadTimeValue
} from '@shared/types';
import { Card, CardContent, CardHeader, CardTitle, FormulaTooltip } from '@shared/ui';
import type { FormulaEntry } from '@shared/ui';

const LEAD_TIME_FORMULAS: FormulaEntry[] = [
  {
    name: 'Lead Time for Changes',
    formula: 'LT = deployedAt − MIN(commits.committedAt) по MR деплоя',
    description:
      'Время от первого коммита MR до его деплоя в продакшен. Отображается медиана и 90-й перцентиль.'
  }
];

const DEPLOYMENT_FREQUENCY_FORMULAS: FormulaEntry[] = [
  {
    name: 'Deployment Frequency',
    formula: 'DF = count(successful_deploys) / period\nКатегории per-day: elite / high / medium / low',
    description:
      'Частота деплоев в продакшен. Парная метрика к Change Failure Rate (FR-06).',
    note: 'Деплои определяются по тегам GitLab с настраиваемым паттерном (например v*).'
  }
];

const CHANGE_FAILURE_RATE_FORMULAS: FormulaEntry[] = [
  {
    name: 'Change Failure Rate',
    formula: 'CFR = count(deploys с isHotfix OR isRevert) / count(all deploys) × 100%',
    description:
      'Доля деплоев, потребовавших хотфикса или отката. Elite: ≤15%, High: ≤30%, Medium: ≤45%, Low: >45%.',
    note: 'Хотфиксы и откаты определяются по labels MR (configurable админом).'
  }
];

const CATEGORY_LABEL: Record<DeploymentFrequencyCategory, string> = {
  elite: 'Elite',
  high: 'High',
  medium: 'Medium',
  low: 'Low'
};

const CATEGORY_COLOR: Record<DeploymentFrequencyCategory, string> = {
  elite: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  high: 'bg-sky-100 text-sky-700 border-sky-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  low: 'bg-rose-100 text-rose-700 border-rose-200'
};

// CFR — обратная семантика: меньше = лучше, поэтому elite=green ОК но low=red.
// Здесь палитра совпадает с DF по логике «лучше → хуже»: elite, high, medium, low.

function CategoryBadge({ category }: { category: DeploymentFrequencyCategory | null }) {
  if (!category) {
    return (
      <span className='text-muted-foreground text-xs italic'>нет данных</span>
    );
  }
  return (
    <span
      className={cn(
        'rounded-full border px-2 py-0.5 text-xs font-medium uppercase tracking-wide',
        CATEGORY_COLOR[category]
      )}
    >
      {CATEGORY_LABEL[category]}
    </span>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className='text-muted-foreground text-xs uppercase tracking-wide'>{label}</p>
      <p className='text-lg font-semibold tabular-nums'>{value}</p>
      {hint && <p className='text-muted-foreground text-xs mt-0.5'>{hint}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lead Time
// ---------------------------------------------------------------------------

function LeadTimeCard({ value }: { value: LeadTimeValue }) {
  return (
    <Card>
      <CardHeader className='pb-2'>
        <div className='flex items-center justify-between gap-2'>
          <CardTitle className='text-base flex items-center gap-2'>
            <Gauge size={16} weight='duotone' />
            Lead Time for Changes
          </CardTitle>
          <FormulaTooltip entries={LEAD_TIME_FORMULAS} />
        </div>
      </CardHeader>
      <CardContent className='space-y-3'>
        <div className='grid grid-cols-2 gap-4'>
          <Stat
            label='Медиана'
            value={formatSeconds(value.medianSeconds)}
            hint={`выборка: ${value.sampleSize} MR`}
          />
          <Stat
            label='p90'
            value={formatSeconds(value.p90Seconds)}
            hint={`деплоев в окне: ${value.deploymentsConsidered}`}
          />
        </div>
        {value.excludedMrsWithoutCommits > 0 && (
          <p className='text-muted-foreground text-xs'>
            ⚠ {value.excludedMrsWithoutCommits} MR без mr_commits отброшено (sync ещё не подтянул)
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Deployment Frequency (paired with CFR — отрисовываем рядом в grid'е)
// ---------------------------------------------------------------------------

function DeploymentFrequencyCard({ value }: { value: DeploymentFrequencyValue }) {
  return (
    <Card>
      <CardHeader className='pb-2'>
        <div className='flex items-center justify-between gap-2'>
          <CardTitle className='text-base flex items-center gap-2'>
            <Rocket size={16} weight='duotone' />
            Deployment Frequency
            <CategoryBadge category={value.category} />
          </CardTitle>
          <FormulaTooltip entries={DEPLOYMENT_FREQUENCY_FORMULAS} />
        </div>
      </CardHeader>
      <CardContent className='space-y-3'>
        <div className='grid grid-cols-2 gap-4'>
          <Stat
            label='Деплоев за период'
            value={value.count.toString()}
            hint={`${value.periodDays} дн.`}
          />
          <Stat
            label='Деплоев / день'
            value={value.perDay.toFixed(2)}
            hint={`${value.granularity} buckets: ${value.timeline.length}`}
          />
        </div>
        {value.timeline.length > 0 && (
          <BucketBars
            buckets={value.timeline.map((b) => ({
              label: b.bucket,
              value: b.count
            }))}
            color='#0ea5e9'
          />
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Change Failure Rate
// ---------------------------------------------------------------------------

function ChangeFailureRateCard({ value }: { value: ChangeFailureRateValue }) {
  return (
    <Card>
      <CardHeader className='pb-2'>
        <div className='flex items-center justify-between gap-2'>
          <CardTitle className='text-base flex items-center gap-2'>
            <Warning size={16} weight='duotone' />
            Change Failure Rate
            <CategoryBadge category={value.category} />
          </CardTitle>
          <FormulaTooltip entries={CHANGE_FAILURE_RATE_FORMULAS} />
        </div>
      </CardHeader>
      <CardContent className='space-y-3'>
        <div className='grid grid-cols-3 gap-4'>
          <Stat
            label='CFR'
            value={`${value.ratePercent.toFixed(1)}%`}
            hint={`${value.failedDeploys} / ${value.totalDeploys}`}
          />
          <Stat label='Hotfix' value={value.breakdown.hotfixDeploys.toString()} />
          <Stat label='Revert' value={value.breakdown.revertDeploys.toString()} />
        </div>
        {value.timeline.length > 0 && (
          <BucketBars
            buckets={value.timeline.map((b) => ({
              label: b.bucket,
              value: b.ratePercent,
              total: b.totalDeploys,
              failed: b.failedDeploys
            }))}
            color='#f43f5e'
            suffix='%'
          />
        )}
      </CardContent>
    </Card>
  );
}

interface Bucket {
  label: string;
  value: number;
  total?: number;
  failed?: number;
}

function BucketBars({
  buckets,
  color,
  suffix
}: {
  buckets: Bucket[];
  color: string;
  suffix?: string;
}) {
  const max = Math.max(...buckets.map((b) => b.value), 0.001);
  return (
    <div className='space-y-1'>
      <div className='flex items-end gap-1 h-16'>
        {buckets.map((b) => {
          const h = (b.value / max) * 100;
          const title =
            b.total !== undefined
              ? `${b.label}: ${b.failed}/${b.total} (${b.value.toFixed(1)}${suffix ?? ''})`
              : `${b.label}: ${b.value}${suffix ?? ''}`;
          return (
            <div
              key={b.label}
              className='flex-1 rounded-t min-w-0'
              style={{
                height: `${Math.max(h, 2)}%`,
                backgroundColor: color,
                opacity: b.value === 0 ? 0.15 : 1
              }}
              title={title}
            />
          );
        })}
      </div>
      <div className='flex justify-between text-[10px] text-muted-foreground'>
        <span>{buckets[0]?.label.slice(0, 10) ?? ''}</span>
        <span>{buckets[buckets.length - 1]?.label.slice(0, 10) ?? ''}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

interface TeamDoraPanelProps {
  teamUid: string;
  periodStart: Date;
  periodEnd: Date;
}

export function TeamDoraPanel({ teamUid, periodStart, periodEnd }: TeamDoraPanelProps) {
  const ltQuery = useQuery({
    queryKey: ['team-lead-time', teamUid, periodStart.getTime(), periodEnd.getTime()],
    queryFn: () => teamsApi.getLeadTime(teamUid, periodStart, periodEnd)
  });

  const dfQuery = useQuery({
    queryKey: ['team-df', teamUid, periodStart.getTime(), periodEnd.getTime()],
    queryFn: () => teamsApi.getDeploymentFrequency(teamUid, periodStart, periodEnd, 'week')
  });

  const cfrQuery = useQuery({
    queryKey: ['team-cfr', teamUid, periodStart.getTime(), periodEnd.getTime()],
    queryFn: () => teamsApi.getChangeFailureRate(teamUid, periodStart, periodEnd, 'week')
  });

  const isLoading = ltQuery.isLoading || dfQuery.isLoading || cfrQuery.isLoading;
  const isError = ltQuery.isError || dfQuery.isError || cfrQuery.isError;

  if (isLoading) {
    return (
      <div className='space-y-3'>
        <div className='bg-muted h-32 animate-pulse rounded' />
        <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
          <div className='bg-muted h-48 animate-pulse rounded' />
          <div className='bg-muted h-48 animate-pulse rounded' />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className='py-8 text-center text-sm text-muted-foreground'>
          Не удалось загрузить DORA-метрики. Убедитесь, что у команды есть проекты и они синхронизированы.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className='space-y-4'>
      {ltQuery.data && <LeadTimeCard value={ltQuery.data.value} />}
      <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
        {dfQuery.data && <DeploymentFrequencyCard value={dfQuery.data.value} />}
        {cfrQuery.data && <ChangeFailureRateCard value={cfrQuery.data.value} />}
      </div>
      <p className='text-muted-foreground text-xs'>
        Deployment Frequency и Change Failure Rate отрисованы рядом по принципу «парной визуализации»
        концепции CherryGit — скорость поставки всегда видна вместе с метрикой качества.
      </p>
    </div>
  );
}
