import { CodeBlock, Info } from '@phosphor-icons/react';

import { cn } from '@shared/lib/utils';
import type { MrSizeBucket, MrSizeValue } from '@shared/types';
import { Card, CardContent, CardHeader, CardTitle, FormulaTooltip } from '@shared/ui';
import type { FormulaEntry } from '@shared/ui';

const MR_SIZE_FORMULAS: FormulaEntry[] = [
  {
    name: 'MR Size — распределение',
    formula: 'size(MR) = linesAdded + linesRemoved\nБакеты: ≤50, 51–200, 201–400, 401–800, >800',
    description:
      'Распределение MR по суммарному количеству изменённых строк. Большие MR коррелируют с длительным ревью.',
    note: 'Черновики (draft) исключаются из выборки.'
  }
];

const BUCKET_COLORS = [
  'bg-green-500',
  'bg-blue-500',
  'bg-yellow-500',
  'bg-orange-500',
  'bg-red-500'
];

interface BucketBarProps {
  buckets: MrSizeBucket[];
  label: string;
}

function BucketBars({ buckets, label }: BucketBarProps) {
  const hasData = buckets.some((b) => b.count > 0);
  return (
    <div>
      <p className='text-xs text-muted-foreground font-medium mb-1.5'>{label}</p>
      {!hasData ? (
        <p className='text-xs text-muted-foreground'>нет данных</p>
      ) : (
        <div className='space-y-1.5'>
          {buckets.map((bucket, i) => (
            <div key={bucket.label} className='flex items-center gap-2'>
              <span className='text-xs text-muted-foreground w-16 shrink-0'>{bucket.label}</span>
              <div className='flex-1 h-4 bg-muted rounded-full overflow-hidden'>
                <div
                  className={cn('h-full rounded-full transition-all', BUCKET_COLORS[i])}
                  style={{ width: `${bucket.percent}%` }}
                />
              </div>
              <span className='text-xs text-muted-foreground w-8 text-right shrink-0'>
                {bucket.count}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface MrSizeCardProps {
  personal: MrSizeValue;
  baseline: MrSizeValue;
}

export function MrSizeCard({ personal, baseline }: MrSizeCardProps) {
  return (
    <Card>
      <CardHeader className='pb-3'>
        <div className='flex items-center justify-between gap-2'>
          <div className='flex items-center gap-2'>
            <CodeBlock size={18} className='text-primary' weight='duotone' />
            <CardTitle className='text-base'>Размер MR</CardTitle>
          </div>
          <div className='flex items-center gap-2'>
            {personal.sampleSize === 0 ? (
              <span className='text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full'>
                нет MR за период
              </span>
            ) : (
              <span className='text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full'>
                {personal.sampleSize} MR
              </span>
            )}
            <FormulaTooltip entries={MR_SIZE_FORMULAS} />
          </div>
        </div>
      </CardHeader>

      <CardContent className='space-y-4'>
        {/* Main stats */}
        <div className='grid grid-cols-2 gap-3'>
          <div>
            <p className='text-xs text-muted-foreground mb-0.5'>Медиана строк</p>
            <p className='text-2xl font-bold tracking-tight'>
              {personal.medianLinesChanged != null
                ? personal.medianLinesChanged.toLocaleString('ru-RU')
                : '—'}
            </p>
          </div>
          <div>
            <p className='text-xs text-muted-foreground mb-0.5'>P90 строк</p>
            <p className='text-xl font-semibold text-muted-foreground'>
              {personal.p90LinesChanged != null
                ? personal.p90LinesChanged.toLocaleString('ru-RU')
                : '—'}
            </p>
          </div>
        </div>

        {/* Personal distribution */}
        <BucketBars buckets={personal.buckets} label='Моё распределение (строк изменений)' />

        {/* Baseline */}
        <div className='bg-muted/50 rounded-lg p-2.5 space-y-2'>
          <div className='flex items-center gap-1.5'>
            <Info size={12} className='text-muted-foreground' />
            <p className='text-xs text-muted-foreground font-medium'>Baseline команды</p>
          </div>
          <div className='grid grid-cols-2 gap-2 mb-2'>
            <div>
              <p className='text-xs text-muted-foreground'>Медиана</p>
              <p className='text-sm font-medium'>
                {baseline.medianLinesChanged != null
                  ? baseline.medianLinesChanged.toLocaleString('ru-RU')
                  : '—'}
              </p>
            </div>
            <div>
              <p className='text-xs text-muted-foreground'>P90</p>
              <p className='text-sm font-medium'>
                {baseline.p90LinesChanged != null
                  ? baseline.p90LinesChanged.toLocaleString('ru-RU')
                  : '—'}
              </p>
            </div>
          </div>
          <BucketBars buckets={baseline.buckets} label='Распределение команды' />
        </div>

        {personal.excludedDrafts > 0 && (
          <p className='text-xs text-muted-foreground'>
            Исключено драфтов: {personal.excludedDrafts}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
