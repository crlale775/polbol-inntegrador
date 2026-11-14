import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../resources/js/lib/sounds',()=>({default:{error:vi.fn()}}));
import ErrorBoundary, { permitirRecargaModulo } from '../../resources/js/components/ui/ErrorBoundary';
afterEach(()=>{cleanup();sessionStorage.clear();vi.restoreAllMocks();});
describe('Recuperación de módulos y errores seguros',()=>{
    it('permite una recuperación de versión y limita la recarga repetida',()=>{
        const error=new Error('Failed to fetch dynamically imported module: /build/antiguo.js');
        expect(permitirRecargaModulo(error,sessionStorage,100000)).toBe(true);
        expect(permitirRecargaModulo(error,sessionStorage,100001)).toBe(false);
        expect(permitirRecargaModulo(error,sessionStorage,130001)).toBe(true);
    });
    it('los demás errores no provocan recargas automáticas',()=>{
        expect(permitirRecargaModulo(new Error('Error de negocio'),sessionStorage)).toBe(false);
    });
    it('conserva recuperación y no muestra detalles internos en la pantalla',()=>{
        vi.spyOn(console,'error').mockImplementation(()=>{});
        function Falla(){throw new Error('ruta-interna-solo-para-prueba');}
        render(<ErrorBoundary><Falla /></ErrorBoundary>);
        expect(screen.getByRole('button',{name:'Reintentar'})).toBeTruthy();
        expect(screen.getByRole('button',{name:'Recargar página'})).toBeTruthy();
        expect(screen.queryByText('ruta-interna-solo-para-prueba')).toBeNull();
    });
});
