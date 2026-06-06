import { ArrowDown, ArrowUp, Clock, Info, Minus } from '@phosphor-icons/react';

import { formatCycleTimeDiff, formatSeconds } from '@shared/lib/format';
import { cn } from '@shared/lib/utils';
import type { CycleTimeMrValue } from '@shared/types';
import { Card, CardContent, CardHeader, CardTitle, FormulaTooltip } from '@shared/ui';
import type { FormulaEntry } from '@shared/ui';

const CYCLE_TIME_MR_FORMULAS: FormulaEntry[] = [
  {
    name: 'Cycle Time MR — медиана',
    formula: 'median(closedAt − createdAt) по merged MR за период',
    description:
      'Время жизни MR от открытия до мержа. Личное значение сравнивается с командным baseline.',
    note: 'Черновики (draft) исключаются из выборки.'
  },
  {
    name: 'Фазы Cycle Time',
    formula:
      'Фаза 1: firstReviewAt − createdAt\nФаза 2: approvedAt − firstReviewAt\nФаза 3: mergedAt − approvedAt',
    description: 'Декомпозиция времени ожидания по фазам жизненного цикла MR.'
  }
];

interface PhaseRowProps {
  label: string;
  personal: number | null;
  baseline: number | null;
  sampleSize: number;
}

function PhaseRow({ label, personal, baseline, sampleSize }: PhaseRowProps) {
  const diff = formatCycleTimeDiff(personal, baseline);
  return (
    <div className='flex items-center gap-3 px-3 py-2.5 border-b last:border-0'>
      <div className='flex-1 min-w-0'>
        <p className='text-xs text-muted-foreground truncate'>{label}</p>
        <p className='text-sm font-medium'>{formatSeconds(personal)}</p>
      </div>
      <div className='text-right shrink-0'>
        <p className='text-xs text-muted-foreground'>baseline</p>
        <p className='text-xs text-muted-foreground'>{formatSeconds(baseline)}</p>
      </div>
      {diff && (
        <div
          className={cn(
            'text-xs font-medium flex items-center gap-0.5 shrink-0',
            diff.better ? 'text-green-600' : 'text-red-500'
          )}
        >
          {diff.better ? (
            diff.text === 'на уровне команды' ? (
              <Minus size={10} />
            ) : (
              <ArrowDown size={10} />
            )
          ) : (
            <ArrowUp size={10} />
          )}
          {diff.text}
        </div>
      )}
      {sampleSize === 0 && (
        <span className='text-xs text-muted-foreground'>нет данных</span>
      )}
    </div>
  );
}

interface CycleTimeMrCardProps {
  personal: CycleTimeMrValue;
  baseline: CycleTimeMrValue;
}

export function CycleTimeMrCard({ personal, baseline }: CycleTimeMrCardProps) {
  const diff = formatCycleTimeDiff(personal.medianTotalSeconds, baseline.medianTotalSeconds);

  return (
    <Card>
      <CardHeader className='pb-3'>
        <div className='flex items-center justify-between gap-2'>
          <div className='flex items-center gap-2'>
            <Clock size={18} className='text-primary' weight='duotone' />
            <CardTitle className='text-base'>Cycle Time MR</CardTitle>
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
            <FormulaTooltip entries={CYCLE_TIME_MR_FORMULAS} />
          </div>
        </div>
      </CardHeader>

      <CardContent className='space-y-4'>
        {/* Main metrics */}
        <div className='grid grid-cols-2 gap-3'>
          <div>
            <p className='text-xs text-muted-foreground mb-0.5'>Медиана (личная)</p>
            <p className='text-2xl font-bold tracking-tight'>
              {formatSeconds(personal.medianTotalSeconds)}
            </p>
            {diff && (
              <div
                className={cn(
                  'text-xs flex items-center gap-0.5 mt-0.5',
                  diff.better ? 'text-green-600' : 'text-red-500'
                )}
              >
                {diff.better ? (
                  diff.text === 'на уровне команды' ? (
                    <Minus size={10} />
                  ) : (
                    <ArrowDown size={10} />
                  )
                ) : (
                  <ArrowUp size={10} />
                )}
                {diff.text}
              </div>
            )}
          </div>
          <div>
            <p className='text-xs text-muted-foreground mb-0.5'>P90 (личный)</p>
            <p className='text-xl font-semibold text-muted-foreground'>
              {formatSeconds(personal.p90TotalSeconds)}
            </p>
          </div>
        </div>

        {/* Baseline */}
        <div className='bg-muted/50 rounded-lg p-2.5'>
          <div className='flex items-center gap-1.5 mb-1.5'>
            <Info size={12} className='text-muted-foreground' />
            <p className='text-xs text-muted-foreground font-medium'>Baseline команды</p>
          </div>
          <div className='grid grid-cols-2 gap-2'>
            <div>
              <p className='text-xs text-muted-foreground'>Медиана</p>
              <p className='text-sm font-medium'>{formatSeconds(baseline.medianTotalSeconds)}</p>
            </div>
            <div>
              <p className='text-xs text-muted-foreground'>P90</p>
              <p className='text-sm font-medium'>{formatSeconds(baseline.p90TotalSeconds)}</p>
            </div>
          </div>
        </div>

        {/* Phases */}
        <div>
          <p className='text-xs text-muted-foreground font-medium mb-1.5'>
            Декомпозиция фаз (личная)
          </p>
          <div className='rounded-lg border overflow-hidden'>
            <PhaseRow
              label='До первого ревью'
              personal={personal.phases.timeToFirstReviewMedianSeconds}
              baseline={baseline.phases.timeToFirstReviewMedianSeconds}
              sampleSize={personal.sampleSizePerPhase.timeToFirstReview}
            />
            <PhaseRow
              label='В ревью'
              personal={personal.phases.timeInReviewMedianSeconds}
              baseline={baseline.phases.timeInReviewMedianSeconds}
              sampleSize={personal.sampleSizePerPhase.timeInReview}
            />
            <PhaseRow
              label='После апрува до мержа'
              personal={personal.phases.timeToMergeAfterApprovalMedianSeconds}
              baseline={baseline.phases.timeToMergeAfterApprovalMedianSeconds}
              sampleSize={personal.sampleSizePerPhase.timeToMergeAfterApproval}
            />
          </div>
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
