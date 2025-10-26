import { cn } from '@/lib/utils';

export type SpinnerVariant = 'default' | 'dots' | 'pulse' | 'bars' | 'ring';

interface SpinnerProps {
  variant?: SpinnerVariant;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function Spinner({ variant = 'default', size = 'md', className }: SpinnerProps) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
  };

  const sizeClass = sizeClasses[size];

  if (variant === 'dots') {
    return (
      <div className={cn('flex gap-1', className)}>
        <div
          className={cn(
            'animate-bounce rounded-full bg-white',
            size === 'sm' ? 'h-2 w-2' : size === 'md' ? 'h-3 w-3' : 'h-4 w-4'
          )}
          style={{ animationDelay: '0ms' }}
        />
        <div
          className={cn(
            'animate-bounce rounded-full bg-white',
            size === 'sm' ? 'h-2 w-2' : size === 'md' ? 'h-3 w-3' : 'h-4 w-4'
          )}
          style={{ animationDelay: '150ms' }}
        />
        <div
          className={cn(
            'animate-bounce rounded-full bg-white',
            size === 'sm' ? 'h-2 w-2' : size === 'md' ? 'h-3 w-3' : 'h-4 w-4'
          )}
          style={{ animationDelay: '300ms' }}
        />
      </div>
    );
  }

  if (variant === 'pulse') {
    return <div className={cn('animate-pulse rounded-full bg-white', sizeClass, className)} />;
  }

  if (variant === 'bars') {
    return (
      <div className={cn('flex gap-1', className)}>
        <div
          className={cn('animate-pulse bg-white', size === 'sm' ? 'h-4 w-1' : size === 'md' ? 'h-6 w-1.5' : 'h-8 w-2')}
          style={{ animationDelay: '0ms', animationDuration: '1s' }}
        />
        <div
          className={cn('animate-pulse bg-white', size === 'sm' ? 'h-4 w-1' : size === 'md' ? 'h-6 w-1.5' : 'h-8 w-2')}
          style={{ animationDelay: '150ms', animationDuration: '1s' }}
        />
        <div
          className={cn('animate-pulse bg-white', size === 'sm' ? 'h-4 w-1' : size === 'md' ? 'h-6 w-1.5' : 'h-8 w-2')}
          style={{ animationDelay: '300ms', animationDuration: '1s' }}
        />
      </div>
    );
  }

  if (variant === 'ring') {
    return (
      <div className={cn('animate-spin rounded-full border-4 border-white/20 border-t-white', sizeClass, className)} />
    );
  }

  // Default spinner
  return (
    <div className={cn('animate-spin rounded-full border-2 border-white border-t-transparent', sizeClass, className)} />
  );
}
