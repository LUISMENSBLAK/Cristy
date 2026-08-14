import { ButtonHTMLAttributes, forwardRef } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg' | 'icon';
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap flex-shrink-0 rounded-md text-sm font-semibold tracking-widest uppercase transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none",
          {
            'bg-[var(--color-bronce)] text-[var(--color-crema)] hover:bg-[var(--color-negro)]': variant === 'primary',
            'bg-[var(--color-gris)] text-[var(--color-crema)] hover:bg-[var(--color-negro)]': variant === 'secondary',
            'border-2 border-[var(--color-bronce)] text-[var(--color-bronce)] hover:bg-[var(--color-bronce)] hover:text-[var(--color-crema)]': variant === 'outline',
            'bg-red-600 text-white hover:bg-red-700': variant === 'danger',
            'hover:bg-black/5 text-[var(--color-negro)]': variant === 'ghost',
            'h-9 px-3': size === 'sm',
            'h-12 px-6 py-3': size === 'md', // Tap friendly default
            'h-16 px-8 text-base': size === 'lg', // Huge tap target
            'h-12 w-12': size === 'icon',
          },
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button };
