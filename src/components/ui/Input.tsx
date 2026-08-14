import { forwardRef, InputHTMLAttributes } from 'react';
import { cn } from './Button';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-12 w-full rounded-md border border-[var(--color-gris)] bg-white/50 px-3 py-2 text-sm placeholder:text-[var(--color-gris)] focus:outline-none focus:ring-2 focus:ring-[var(--color-bronce)] disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
