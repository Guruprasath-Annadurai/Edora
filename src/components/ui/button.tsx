import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl text-sm font-semibold transition-all duration-200 touch-target active:scale-95 disabled:opacity-50 disabled:pointer-events-none font-body relative overflow-hidden',
  {
    variants: {
      variant: {
        default:     'text-white',
        secondary:   'bg-secondary text-foreground border border-border hover:bg-secondary/80',
        ghost:       'text-muted-foreground hover:text-foreground hover:bg-secondary',
        destructive: 'text-red-400 border border-red-500/30',
        outline:     'border border-border text-foreground hover:bg-secondary',
        liquid:      'text-white',
        glass:       'text-white',
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

const VARIANT_STYLES: Record<string, React.CSSProperties> = {
  default: {
    background: 'linear-gradient(145deg, #6373F6 0%, #5B6AF5 45%, #7C3AED 100%)',
    boxShadow: 'inset 0 1.5px 0 rgba(255,255,255,0.22), inset 0 -1px 0 rgba(0,0,0,0.18), 0 4px 20px rgba(91,106,245,0.45), 0 1px 4px rgba(0,0,0,0.3)',
  },
  liquid: {
    background: 'rgba(255,255,255,0.06)',
    backdropFilter: 'blur(36px) saturate(180%) brightness(1.06)',
    WebkitBackdropFilter: 'blur(36px) saturate(180%) brightness(1.06)',
    border: '1px solid rgba(255,255,255,0.14)',
    boxShadow: 'inset 0 1.5px 0 rgba(255,255,255,0.18), inset 0 -0.5px 0 rgba(0,0,0,0.15), 0 4px 20px rgba(0,0,0,0.3)',
  },
  glass: {
    background: 'rgba(91,106,245,0.12)',
    backdropFilter: 'blur(24px) saturate(160%)',
    WebkitBackdropFilter: 'blur(24px) saturate(160%)',
    border: '1px solid rgba(91,106,245,0.22)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), 0 4px 16px rgba(91,106,245,0.20)',
  },
  outline: {
    background: 'rgba(15,20,45,0.55)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
  },
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, style, children, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    const v = variant ?? 'default';
    const variantStyle = VARIANT_STYLES[v as string] ?? {};

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        style={{ ...variantStyle, ...style }}
        {...props}
      >
        {/* Specular top-edge highlight for default + liquid variants */}
        {(v === 'default' || v === 'liquid') && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute', top: 0, left: '10%', right: '10%',
              height: 1, borderRadius: '50%', pointerEvents: 'none',
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.36), transparent)',
            }}
          />
        )}
        {children}
      </Comp>
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
