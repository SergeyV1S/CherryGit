import { useState } from 'react';

import { CaretDown, CaretRight, Info } from '@phosphor-icons/react';

import { cn } from '@shared/lib/utils';

interface FormulaEntry {
  name: string;
  formula: string;
  description: string;
  note?: string;
}

interface FormulaBlockProps {
  entries: FormulaEntry[];
  className?: string;
}

export function FormulaBlock({ entries, className }: FormulaBlockProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className={cn('rounded-lg border bg-muted/20', className)}>
      <button
        onClick={() => setOpen(!open)}
        className='w-full flex items-center gap-2 px-4 py-3 text-sm text-left hover:bg-muted/40 transition-colors rounded-lg'
      >
        <Info size={16} className='text-muted-foreground shrink-0' />
        <span className='font-medium flex-1'>Формулы расчёта метрик</span>
        {open ? (
          <CaretDown size={14} className='text-muted-foreground' />
        ) : (
          <CaretRight size={14} className='text-muted-foreground' />
        )}
      </button>

      {open && (
        <div className='px-4 pb-4 space-y-4 border-t mt-0 pt-4'>
          {entries.map((entry, i) => (
            <div key={i} className='space-y-1.5'>
              <p className='text-sm font-semibold'>{entry.name}</p>
              <code className='block text-xs bg-background border rounded px-3 py-2 font-mono text-foreground'>
                {entry.formula}
              </code>
              <p className='text-xs text-muted-foreground'>{entry.description}</p>
              {entry.note && (
                <p className='text-xs text-muted-foreground italic'>{entry.note}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface MetricTooltipProps {
  text: string;
  children: React.ReactNode;
}

export function MetricTooltip({ text, children }: MetricTooltipProps) {
  const [visible, setVisible] = useState(false);

  return (
    <span className='relative inline-flex items-center gap-1'>
      {children}
      <button
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        className='text-muted-foreground hover:text-foreground transition-colors'
      >
        <Info size={12} />
      </button>
      {visible && (
        <span className='absolute bottom-full left-1/2 -translate-x-1/2 mb-1 w-56 text-xs bg-popover border rounded shadow-md p-2 z-50 text-foreground'>
          {text}
        </span>
      )}
    </span>
  );
}
