import * as React from 'react';

import { cn } from '@shared/lib/utils';
import { type VariantProps, cva } from 'class-variance-authority';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold leading-tight whitespace-nowrap transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 focus:ring-offset-1',
  {
    variants: {
      variant: {
        default:
          'border-primary/20 bg-gradient-to-b from-primary to-[oklch(0.45_0.22_18)] text-primary-foreground shadow-sm',
        secondary:
          'border-primary/15 bg-primary/10 text-primary',
        destructive:
          'border-destructive/30 bg-destructive/12 text-destructive',
        outline:
          'border-border bg-card text-foreground',
        success:
          'border-emerald-300/60 bg-emerald-100 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-900/30 dark:text-emerald-300',
        warning:
          'border-amber-300/60 bg-amber-100 text-amber-700 dark:border-amber-500/30 dark:bg-amber-900/30 dark:text-amber-300'
      }
    },
    defaultVariants: { variant: 'default' }
  }
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof badgeVariants>) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
