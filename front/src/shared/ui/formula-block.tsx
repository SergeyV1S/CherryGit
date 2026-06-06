import { useState } from 'react';

import { Question } from '@phosphor-icons/react';

import { cn } from '@shared/lib/utils';

export interface FormulaEntry {
  name: string;
  formula: string;
  description: string;
  note?: string;
}

interface FormulaTooltipProps {
  entries: FormulaEntry[];
  className?: string;
  align?: 'right' | 'left';
}

export function FormulaTooltip({ entries, className, align = 'right' }: FormulaTooltipProps) {
  const [visible, setVisible] = useState(false);

  return (
    <span className={cn('relative inline-flex shrink-0', className)}>
      <button
        type='button'
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        className='inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50'
        aria-label='Формула расчёта метрики'
      >
        <Question size={16} weight='bold' />
      </button>
      {visible && (
        <div
          role='tooltip'
          className={cn(
            'absolute top-full mt-2 w-80 max-w-[min(20rem,90vw)] rounded-lg border bg-popover text-popover-foreground shadow-lg z-50 p-3 space-y-3 pointer-events-none',
            align === 'right' ? 'right-0' : 'left-0'
          )}
        >
          {entries.map((entry, i) => (
            <div key={i} className='space-y-1.5'>
              <p className='text-xs font-semibold leading-tight'>{entry.name}</p>
              <code className='block text-[11px] bg-muted/70 border rounded px-2 py-1.5 font-mono whitespace-pre-wrap break-words leading-snug'>
                {entry.formula}
              </code>
              <p className='text-[11px] leading-snug text-muted-foreground'>{entry.description}</p>
              {entry.note && (
                <p className='text-[11px] leading-snug italic text-muted-foreground'>{entry.note}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </span>
  );
}
