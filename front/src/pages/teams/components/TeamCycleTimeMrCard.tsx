import { Clock } from '@phosphor-icons/react';

import { formatSeconds } from '@shared/lib/format';
import type { CycleTimeMrValue } from '@shared/types';
import { Card, CardContent, CardHeader, CardTitle } from '@shared/ui';

interface TeamCycleTimeMrCardProps {
  value: CycleTimeMrValue;
}

export function TeamCycleTimeMrCard({ value }: TeamCycleTimeMrCardProps) {
  return (
    <Card>
      <CardHeader className='pb-3'>
        <div className='flex items-center justify-between gap-2'>
          <div className='flex items-center gap-2'>
            <Clock size={18} className='text-primary' weight='duotone' />
            <CardTitle className='text-base'>Cycle Time MR</CardTitle>
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
        {/* Main metrics */}
        <div className='grid grid-cols-2 gap-3'>
          <div>
            <p className='text-xs text-muted-foreground mb-0.5'>Медиана</p>
            <p className='text-2xl font-bold tracking-tight'>
              {formatSeconds(value.medianTotalSeconds)}
            </p>
          </div>
          <div>
            <p className='text-xs text-muted-foreground mb-0.5'>P90</p>
            <p className='text-xl font-semibold text-muted-foreground'>
              {formatSeconds(value.p90TotalSeconds)}
            </p>
          </div>
        </div>

        {/* Phases */}
        <div>
          <p className='text-xs text-muted-foreground font-medium mb-1.5'>Декомпозиция фаз</p>
          <div className='rounded-lg border overflow-hidden'>
            {[
              {
                label: 'До первого ревью',
                median: value.phases.timeToFirstReviewMedianSeconds,
                p90: value.phases.timeToFirstReviewP90Seconds,
                n: value.sampleSizePerPhase.timeToFirstReview
              },
              {
                label: 'В ревью',
                median: value.phases.timeInReviewMedianSeconds,
                p90: value.phases.timeInReviewP90Seconds,
                n: value.sampleSizePerPhase.timeInReview
              },
              {
                label: 'После апрува до мержа',
                median: value.phases.timeToMergeAfterApprovalMedianSeconds,
                p90: value.phases.timeToMergeAfterApprovalP90Seconds,
                n: value.sampleSizePerPhase.timeToMergeAfterApproval
              }
            ].map((phase) => (
              <div key={phase.label} className='flex items-center gap-3 px-3 py-2 border-b last:border-0'>
                <div className='flex-1 min-w-0'>
                  <p className='text-xs text-muted-foreground'>{phase.label}</p>
                </div>
                <div className='text-right shrink-0'>
                  <p className='text-sm font-medium'>{formatSeconds(phase.median)}</p>
                  <p className='text-xs text-muted-foreground'>p90: {formatSeconds(phase.p90)}</p>
                </div>
                {phase.n === 0 && (
                  <span className='text-xs text-muted-foreground shrink-0'>—</span>
                )}
              </div>
            ))}
          </div>
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
