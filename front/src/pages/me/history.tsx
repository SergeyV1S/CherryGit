import { useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import { ChartLineUp, GitBranch } from '@phosphor-icons/react';

import { meApi } from '@shared/api/me.api';
import { useAuth } from '@shared/hooks';
import { formatSeconds } from '@shared/lib/format';
import type {
  CycleTimeMrValue,
  MetricSnapshot,
  MrSizeValue,
  MyMetricsHistoryTeam
} from '@shared/types';
import { Card, CardContent, CardHeader, CardTitle } from '@shared/ui';

import { PeriodSelector } from './components/PeriodSelector';

type SeriesPoint = { x: number; y: number; label: string };

function snapshotsToSeries<V>(
  snapshots: MetricSnapshot[],
  extract: (value: V) => number | null
): SeriesPoint[] {
  return snapshots
    .map((s) => {
      const y = extract(s.value as V);
      return y === null
        ? null
        : {
            x: new Date(s.periodEnd).getTime(),
            y,
            label: new Date(s.periodEnd).toLocaleDateString('ru-RU', {
              day: '2-digit',
              month: 'short'
            })
          };
    })
    .filter((p): p is SeriesPoint => p !== null);
}

interface SparklineProps {
  points: SeriesPoint[];
  format: (v: number) => string;
  color?: string;
}

function Sparkline({ points, format, color = '#0ea5e9' }: SparklineProps) {
  if (points.length === 0) {
    return (
      <div className='text-muted-foreground py-6 text-center text-xs'>
        Снепшотов за период нет
      </div>
    );
  }

  const w = 360;
  const h = 90;
  const pad = 8;

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;

  const project = (p: SeriesPoint) => ({
    x: pad + ((p.x - minX) / spanX) * (w - 2 * pad),
    y: h - pad - ((p.y - minY) / spanY) * (h - 2 * pad)
  });

  const projected = points.map(project);
  const path = projected
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');

  const last = points[points.length - 1];
  const first = points[0];

  return (
    <div className='space-y-1'>
      <svg viewBox={`0 0 ${w} ${h}`} className='w-full' role='img' aria-label='Sparkline'>
        <path d={path} fill='none' stroke={color} strokeWidth='2' strokeLinejoin='round' />
        {projected.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r='2.5' fill={color} />
        ))}
      </svg>
      <div className='text-muted-foreground flex justify-between text-[10px]'>
        <span>
          {first.label}: <strong className='text-foreground'>{format(first.y)}</strong>
        </span>
        <span>
          {last.label}: <strong className='text-foreground'>{format(last.y)}</strong>
        </span>
      </div>
    </div>
  );
}

function TeamHistoryCard({ team }: { team: MyMetricsHistoryTeam }) {
  const ctMedian = snapshotsToSeries<CycleTimeMrValue>(
    team.history.cycle_time_mr,
    (v) => v.medianSeconds
  );
  const ctP90 = snapshotsToSeries<CycleTimeMrValue>(
    team.history.cycle_time_mr,
    (v) => v.p90Seconds
  );
  const sizeMedian = snapshotsToSeries<MrSizeValue>(
    team.history.mr_size,
    (v) => v.medianLinesChanged
  );

  return (
    <Card>
      <CardHeader className='pb-2'>
        <CardTitle className='text-base flex items-center gap-2'>
          <GitBranch size={16} weight='duotone' />
          {team.teamName}
          <span className='text-muted-foreground text-xs font-normal'>
            · ваша роль: {team.myRole === 'LEAD' ? 'Тимлид' : 'Разработчик'}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className='grid grid-cols-1 gap-4 md:grid-cols-3'>
        <div>
          <p className='text-muted-foreground mb-1 text-xs font-medium uppercase tracking-wide'>
            Cycle Time MR (median)
          </p>
          <Sparkline points={ctMedian} format={(v) => formatSeconds(v)} color='#0ea5e9' />
        </div>
        <div>
          <p className='text-muted-foreground mb-1 text-xs font-medium uppercase tracking-wide'>
            Cycle Time MR (p90)
          </p>
          <Sparkline points={ctP90} format={(v) => formatSeconds(v)} color='#a855f7' />
        </div>
        <div>
          <p className='text-muted-foreground mb-1 text-xs font-medium uppercase tracking-wide'>
            MR Size (median, строк)
          </p>
          <Sparkline points={sizeMedian} format={(v) => Math.round(v).toString()} color='#10b981' />
        </div>
      </CardContent>
    </Card>
  );
}

export default function MeHistoryPage() {
  const { user } = useAuth();
  const [periodDays, setPeriodDays] = useState(90);

  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - periodDays);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['me-history', periodDays],
    queryFn: () => meApi.getMyMetricsHistory(from, to),
    enabled: !!user
  });

  const hasNoTeams = !user?.teams || user.teams.length === 0;

  return (
    <div className='page-shell'>
      <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3'>
        <div>
          <h1 className='page-title'>История метрик</h1>
          <p className='page-subtitle text-balance'>
            Динамика командных снепшотов по командам, в которых вы состоите
          </p>
        </div>
        <PeriodSelector selected={periodDays} onChange={setPeriodDays} />
      </div>

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

      {!hasNoTeams && isLoading && (
        <div className='space-y-3'>
          <div className='bg-muted h-48 animate-pulse rounded' />
          <div className='bg-muted h-48 animate-pulse rounded' />
        </div>
      )}

      {!hasNoTeams && isError && (
        <Card>
          <CardContent className='py-8 text-center text-sm text-muted-foreground'>
            Не удалось загрузить историю
          </CardContent>
        </Card>
      )}

      {!hasNoTeams && data && data.teams.length === 0 && (
        <Card>
          <CardContent className='py-8 text-center'>
            <ChartLineUp
              size={32}
              className='text-muted-foreground mx-auto mb-2'
              weight='duotone'
            />
            <p className='text-sm'>Снепшотов ещё нет — они появятся после первого тика snapshot-writer'a</p>
          </CardContent>
        </Card>
      )}

      {!hasNoTeams && data && data.teams.length > 0 && (
        <div className='space-y-4'>
          {data.teams.map((t) => (
            <TeamHistoryCard key={t.teamUid} team={t} />
          ))}
        </div>
      )}
    </div>
  );
}
