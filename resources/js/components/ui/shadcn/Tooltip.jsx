/**
 * Tooltip — primitiva shadcn/ui sobre Radix.
 *
 * Por qué Radix: posicionamiento con colisiones, apertura por teclado y
 * `aria-describedby` ya resueltos. La piel es institucional (tinta OFBOL),
 * no la gris genérica del tema por defecto.
 */
import React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '../../../lib/cn';

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export const TooltipContent = React.forwardRef(function TooltipContent(
    { className, sideOffset = 6, ...props },
    ref
) {
    return (
        <TooltipPrimitive.Portal>
            <TooltipPrimitive.Content
                ref={ref}
                sideOffset={sideOffset}
                className={cn(
                    'z-[95] rounded-md px-2 py-1.5 text-[11px] font-semibold leading-none',
                    'ofbol-animate-fade-in',
                    className
                )}
                style={{ background: 'var(--ofbol-ink)', color: '#fbfaf6' }}
                {...props}
            />
        </TooltipPrimitive.Portal>
    );
});

/** Atajo: tooltip de una sola etiqueta sobre un elemento que ya existe. */
export function TooltipAyuda({ label, side = 'right', children }) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>{children}</TooltipTrigger>
            <TooltipContent side={side}>{label}</TooltipContent>
        </Tooltip>
    );
}

export default Tooltip;
