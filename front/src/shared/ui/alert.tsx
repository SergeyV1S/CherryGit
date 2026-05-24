import * as React from 'react';

import { cn } from '@shared/lib/utils';
import { type VariantProps, cva } from 'class-variance-authority';

const alertVariants = cva(
  'relative w-full rounded-lg border px-4 py-3.5 text-sm shadow-sm [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg~*]:pl-7',
  {
    variants: {
      variant: {
        default:
          'border-primary/20 bg-primary/5 text-foreground [&>svg]:text-primary',
        destructive:
          'border-destructive/40 bg-destructive/8 text-destructive dark:border-destructive [&>svg]:text-destructive'
      }
    },
    defaultVariants: { variant: 'default' }
  }
);

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return (
    <div role='alert' className={cn(alertVariants({ variant }), className)} {...props} />
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('mb-1 font-medium leading-none tracking-tight', className)}
      {...props}
    />
  );
}

function AlertDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div className={cn('text-sm [&_p]:leading-relaxed', className)} {...props} />
  );
}

export { Alert, AlertDescription, AlertTitle };
