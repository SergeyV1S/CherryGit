import type { BusFactorModule, BusFactorValue } from '@shared/types';
import { Card, CardContent, CardHeader, CardTitle, FormulaTooltip } from '@shared/ui';
import type { FormulaEntry } from '@shared/ui';
import { Tree } from '@phosphor-icons/react';
import { cn } from '@shared/lib/utils';

const BUS_FACTOR_FORMULAS: FormulaEntry[] = [
  {
    name: 'Bus Factor по модулю',
    formula: 'count(distinct authors | merged MR touching module, last 90 days)',
    description:
      'Число активных контрибьюторов модуля за 90 дней. Красный — 1 автор (критический риск), жёлтый — 2, зелёный — ≥3.'
  },
  {
    name: 'Определение модуля',
    formula: 'Первая директория пути файла (авто) или явная настройка code_modules',
    description:
      'Автоматические модули берут первую директорию пути. Явные задаются администратором через code_modules.'
  }
];

const COLOR_MAP: Record<string, { badge: string; label: string }> = {
  red: { badge: 'bg-red-100 text-red-700 border-red-200', label: 'Критический риск' },
  yellow: { badge: 'bg-yellow-100 text-yellow-700 border-yellow-200', label: 'Умеренный риск' },
  green: { badge: 'bg-green-100 text-green-700 border-green-200', label: 'Хорошо' }
};

function ModuleRow({ module }: { module: BusFactorModule }) {
  const color = COLOR_MAP[module.color] ?? COLOR_MAP.red;
  return (
    <div className='flex items-center gap-3 px-3 py-2.5 border-b last:border-0'>
      <div className='flex-1 min-w-0'>
        <div className='flex items-center gap-2'>
          <span className='text-sm font-medium truncate'>{module.name}</span>
          {module.isImplicit && (
            <span className='text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded'>
              авто
            </span>
          )}
        </div>
        {module.pathPattern && (
          <p className='text-xs text-muted-foreground font-mono truncate'>{module.pathPattern}</p>
        )}
      </div>
      <div className='flex items-center gap-2 shrink-0'>
        <span className='text-sm font-semibold'>{module.activeContributors}</span>
        <span
          className={cn(
            'text-xs border px-2 py-0.5 rounded-full font-medium',
            color.badge
          )}
        >
          {module.activeContributors === 1
            ? 'Bus risk'
            : module.activeContributors === 2
              ? '2 чел.'
              : `${module.activeContributors} чел.`}
        </span>
      </div>
    </div>
  );
}

interface BusFactorTableProps {
  value: BusFactorValue;
}

export function BusFactorTable({ value }: BusFactorTableProps) {
  const redCount = value.modules.filter((m) => m.color === 'red').length;
  const yellowCount = value.modules.filter((m) => m.color === 'yellow').length;
  const greenCount = value.modules.filter((m) => m.color === 'green').length;

  return (
    <Card>
      <CardHeader className='pb-3'>
        <div className='flex items-center justify-between gap-2'>
          <div className='flex items-center gap-2'>
            <Tree size={18} className='text-primary' weight='duotone' />
            <CardTitle className='text-base'>Bus Factor по модулям</CardTitle>
          </div>
          <div className='flex items-center gap-2'>
            <span className='text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full'>
              окно {value.windowDays} дней
            </span>
            <FormulaTooltip entries={BUS_FACTOR_FORMULAS} />
          </div>
        </div>
      </CardHeader>
      <CardContent className='space-y-4'>
        {/* Summary */}
        <div className='grid grid-cols-3 gap-2'>
          <div className='rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40 p-2 text-center'>
            <p className='text-xl font-bold text-red-600'>{redCount}</p>
            <p className='text-xs text-red-600'>критических</p>
          </div>
          <div className='rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-900/40 p-2 text-center'>
            <p className='text-xl font-bold text-yellow-600'>{yellowCount}</p>
            <p className='text-xs text-yellow-600'>умеренных</p>
          </div>
          <div className='rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-900/40 p-2 text-center'>
            <p className='text-xl font-bold text-green-600'>{greenCount}</p>
            <p className='text-xs text-green-600'>в норме</p>
          </div>
        </div>

        {/* Overall */}
        <div className='flex items-center gap-2 rounded-lg bg-muted/50 p-3'>
          <p className='text-sm text-muted-foreground flex-1'>
            Общий Bus Factor команды:
          </p>
          <span
            className={cn(
              'text-lg font-bold',
              value.overallBusFactor == null
                ? 'text-muted-foreground'
                : value.overallBusFactor === 1
                  ? 'text-red-600'
                  : value.overallBusFactor === 2
                    ? 'text-yellow-600'
                    : 'text-green-600'
            )}
          >
            {value.overallBusFactor ?? '—'}
          </span>
        </div>

        {/* Module list */}
        {value.modules.length === 0 ? (
          <p className='text-sm text-muted-foreground text-center py-4'>
            {value.sampleSize === 0
              ? 'Нет merged MR с данными о файлах за выбранный период'
              : 'Модули не обнаружены'}
          </p>
        ) : (
          <div className='rounded-lg border overflow-hidden'>
            {value.modules.map((module) => (
              <ModuleRow key={module.name} module={module} />
            ))}
          </div>
        )}

        {value.excludedMrsWithoutPaths > 0 && (
          <p className='text-xs text-muted-foreground'>
            {value.excludedMrsWithoutPaths} MR не содержат данных о файлах (засинхронизированы до
            обновления системы) — требуется пересинхронизация проектов.
          </p>
        )}

        <p className='text-xs text-muted-foreground'>
          {value.sampleSize} merged MR в выборке. Модуль определяется по первой директории пути
          файла (автоматически) или настройкам code_modules.
        </p>
      </CardContent>
    </Card>
  );
}
