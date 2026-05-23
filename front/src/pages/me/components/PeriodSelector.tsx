import { Button } from '@shared/ui';
import { cn } from '@shared/lib/utils';

export interface Period {
  label: string;
  days: number;
}

export const PERIODS: Period[] = [
  { label: '30 дней', days: 30 },
  { label: '90 дней', days: 90 },
  { label: '180 дней', days: 180 }
];

interface PeriodSelectorProps {
  selected: number;
  onChange: (days: number) => void;
}

export function PeriodSelector({ selected, onChange }: PeriodSelectorProps) {
  return (
    <div className='flex items-center gap-1 rounded-lg border p-1'>
      {PERIODS.map((p) => (
        <Button
          key={p.days}
          size='sm'
          variant={selected === p.days ? 'default' : 'ghost'}
          onClick={() => onChange(p.days)}
          className={cn('h-7 px-3 text-xs', selected !== p.days && 'text-muted-foreground')}
        >
          {p.label}
        </Button>
      ))}
    </div>
  );
}
