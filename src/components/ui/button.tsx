import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl text-sm font-semibold transition-all duration-200 touch-target active:scale-95 disabled:opacity-50 disabled:pointer-events-none font-body',
  {
    variants: {
      variant: {
        default:     'text-white shadow-nova',
        secondary:   'bg-secondary text-foreground border border-border hover:bg-secondary/80',
        ghost:       'text-muted-foreground hover:text-foreground hover:bg-secondary',
        destructive: 'bg-red-50 text-red-500 border border-red-200',
        outline:     'border border-border bg-white text-foreground hover:bg-secondary',
      },
      size: {
        default: 'h-12 px-6',
        sm:      'h-9 px-4 text-xs',
        lg:      'h-14 px-8 text-base',
        icon:    'h-11 w-11',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
);

const NOVA_GRADIENT = 'linear-gradient(135deg, #5B6AF5 0%, #8B5CF6 100%)';

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, style, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    const gradientStyle = (variant === 'default' || !variant) ? { background: NOVA_GRADIENT } : {};
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
