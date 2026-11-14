/**
 * cn — composición de clases al estilo shadcn/ui.
 *
 * clsx resuelve condicionales y tailwind-merge elimina conflictos
 * (`px-2 px-4` → `px-4`). Es la pieza que permite que los componentes
 * nuevos acepten `className` sin pelearse con sus estilos base.
 */
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...entradas) {
    return twMerge(clsx(entradas));
}
