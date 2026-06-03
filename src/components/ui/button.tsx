import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl text-sm font-semibold transition-all duration-200 touch-target active:scale-95 disabled:opacity-50 disabled:pointer-events-none font-body',
  {
    variants: {
      variant: {
        default: 'bg-nova-gradient text-white shadow-nova',
        secondary: 'glass text-foreground hover:bg-white/10',
        ghost: 'text-muted-foreground hover:text-foreground hover:bg-white/5',
        destructive: 'bg-red-500/20 text-red-400 border border-red-500/30',
        outline: 'border border-border bg-transparent text-foreground hover:bg-white/5',
      },
      size: {
        default: 'h-12 px-6',
        sm: 'h-9 px-4 text-xs',
        lg: 'h-14 px-8 text-base',
        icon: 'h-11 w-11',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
);

const novaGradient = 'linear-gradient(135deg, #7C3AED 0%, #3B82F6 50%, #06B6D4 100%)';

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, style, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    const gradientStyle = variant === 'default' ? { background: novaGradient } : {};
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        style={{ ...gradientStyle, ...style }}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
