import { CodeBlock } from '@phosphor-icons/react';

import { cn } from '@shared/lib/utils';
import type { MrSizeBucket, MrSizeValue } from '@shared/types';
import { Card, CardContent, CardHeader, CardTitle } from '@shared/ui';

const BUCKET_COLORS = [
  'bg-green-500',
  'bg-blue-500',
  'bg-yellow-500',
  'bg-orange-500',
  'bg-red-500'
];

function BucketBar({ bucket, colorClass }: { bucket: MrSizeBucket; colorClass: string }) {
  return (
    <div className='flex items-center gap-2'>
      <span className='text-xs text-muted-foreground w-16 shrink-0'>{bucket.label}</span>
      <div className='flex-1 h-4 bg-muted rounded-full overflow-hidden'>
        <div
          className={cn('h-full rounded-full transition-all', colorClass)}
          style={{ width: `${bucket.percent}%` }}
        />
      </div>
      <span className='text-xs text-muted-foreground w-8 text-right shrink-0'>{bucket.count}</span>
    </div>
  );
}

interface TeamMrSizeCardProps {
  value: MrSizeValue;
}

export function TeamMrSizeCard({ value }: TeamMrSizeCardProps) {
  const hasData = value.buckets.some((b) => b.count > 0);

  return (
    <Card>
      <CardHeader className='pb-3'>
        <div className='flex items-center justify-between gap-2'>
          <div className='flex items-center gap-2'>
            <CodeBlock size={18} className='text-primary' weight='duotone' />
            <CardTitle className='text-base'>Размер MR</CardTitle>
          </div>
          {value.sampleSize === 0 ? (
            <span className='text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full'>
              нет MR за период
            </span>
          ) : (
            <span className='text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full'>
              {value.sampleSize} MR
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className='space-y-4'>
        {/* Main stats */}
        <div className='grid grid-cols-2 gap-3'>
          <div>
            <p className='text-xs text-muted-foreground mb-0.5'>Медиана строк</p>
            <p className='text-2xl font-bold tracking-tight'>
              {value.medianLinesChanged != null
                ? value.medianLinesChanged.toLocaleString('ru-RU')
                : '—'}
            </p>
          </div>
          <div>
            <p className='text-xs text-muted-foreground mb-0.5'>P90 строк</p>
            <p className='text-xl font-semibold text-muted-foreground'>
              {value.p90LinesChanged != null
                ? value.p90LinesChanged.toLocaleString('ru-RU')
                : '—'}
            </p>
          </div>
        </div>

        {/* Distribution */}
        <div>
          <p className='text-xs text-muted-foreground font-medium mb-2'>
            Распределение по размеру (строк изменений)
          </p>
          {!hasData ? (
            <p className='text-xs text-muted-foreground'>нет данных</p>
          ) : (
            <div className='space-y-1.5'>
              {value.buckets.map((bucket, i) => (
                <BucketBar key={bucket.label} bucket={bucket} colorClass={BUCKET_COLORS[i]} />
              ))}
            </div>
          )}
        </div>

        {value.excludedDrafts > 0 && (
          <p className='text-xs text-muted-foreground'>
            Исключено драфтов: {value.excludedDrafts}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
