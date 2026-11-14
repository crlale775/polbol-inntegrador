/**
 * Reportes · un conjunto DISTINTO por rol.
 *
 * Requisito de negocio: la Secretaría EPI, el Comando Departamental y el
 * Comando General NO deben ver las mismas gráficas. Antes los tres abrían en
 * un "Resumen" idéntico (mismo donut de estados + misma evolución mensual) y
 * por eso los reportes parecían iguales.
 *
 * Además, debajo de cada reporte va el panel interactivo "Qué hacer ahora",
 * con cifras del período y accesos que cambian de pestaña.
 */
import React from 'react';
import { render, act, cleanup, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, afterEach } from 'vitest';

import { AuthProvider } from '../../resources/js/context/AuthContext';

vi.mock('../../resources/js/lib/api.js', async () => {
    const { reporteFixture } = await import('./fixtures/reportes');
    return { default: {
        get: vi.fn((path) => {
            const user=JSON.parse(sessionStorage.getItem('ofbol_user') || '{}');
            const rol={1:'unidad',2:'departamental',3:'nacional'}[user.id_usuario];
            return Promise.resolve(String(path).startsWith('/reportes?') ? reporteFixture(rol) : []);
        }),
        download: vi.fn(async () => ({blob:new Blob(['test']),filename:'Policia_Boliviana.xlsx'})),
        post: vi.fn(async()=>({})),put:vi.fn(async()=>({})),patch:vi.fn(async()=>({})),delete:vi.fn(async()=>({})),upload:vi.fn(async()=>({})),
    }};
});
import api from '../../resources/js/lib/api';

import EPIReportes from '../../resources/views/secretario_unidad/Reportes';
import DptalReportes from '../../resources/views/secretario_comando_departamental/Reportes';
import GenReportes from '../../resources/views/comando_general/Reportes';

const USUARIOS = {
    epi: { id_usuario: 1, usuario: 'sec_sanpedro', rol: 'Secretario EPI', id_epi: 1, epi: 'EPI 1 San Pedro', estado: true },
    dptal: { id_usuario: 2, usuario: 'revisor_lapaz', rol: 'Secretario Comando Departamental', id_epi: null, epi: 'Comando Departamental La Paz', estado: true },
    general: { id_usuario: 3, usuario: 'comando_general', rol: 'Comando General', id_epi: null, epi: 'Comando General de la Policía Boliviana', estado: true },
};

async function montar(Componente, usuario) {
    sessionStorage.clear();
    localStorage.clear();
    sessionStorage.setItem('ofbol_user', JSON.stringify(USUARIOS[usuario]));

    const utils = render(
        <MemoryRouter initialEntries={['/']}>
            <AuthProvider>
                <Componente />
            </AuthProvider>
        </MemoryRouter>
    );

    await act(async () => {
        await new Promise((resolver) => setTimeout(resolver, 0));
    });

    return utils;
}

/** Etiquetas de las pestañas de reporte visibles. */
const pestanas = (container) =>
    [...container.querySelectorAll('[role="tab"]')].map((b) => b.textContent.trim());

const VISTAS = [
    ['EPI', EPIReportes, 'epi'],
    ['Departamental', DptalReportes, 'dptal'],
    ['General', GenReportes, 'general'],
];

describe('Reportes · conjuntos distintos por rol', () => {
    afterEach(() => {
        cleanup();
        sessionStorage.clear();
        localStorage.clear();
    });

    it.each(VISTAS)('%s · muestra el panel interactivo "Qué hacer ahora"', async (_rol, Vista, usuario) => {
        const { container } = await montar(Vista, usuario);

        expect(container.textContent).toContain('Qué hacer ahora');

        // Las acciones son botones reales (interactivos), no texto suelto.
        const botones = [...container.querySelectorAll('button')]
            .filter((b) => /Ver →|Viendo/.test(b.textContent));
        expect(botones.length).toBeGreaterThanOrEqual(2);
    });

    it('los tres roles NO comparten el mismo conjunto de pestañas', async () => {
        const conjuntos = [];

        for (const [, Vista, usuario] of VISTAS) {
            const { container } = await montar(Vista, usuario);
            conjuntos.push(pestanas(container).join('|'));
            cleanup();
        }

        expect(new Set(conjuntos).size).toBe(3);
    });

    it('la pestaña de entrada de cada rol es distinta', async () => {
        const primeras = [];

        for (const [, Vista, usuario] of VISTAS) {
            const { container } = await montar(Vista, usuario);
            primeras.push(pestanas(container)[0]);
            cleanup();
        }

        expect(new Set(primeras).size).toBe(3);
    });

    it('al tocar una acción del panel cambia la pestaña activa', async () => {
        const { container } = await montar(DptalReportes, 'dptal');

        const activa = () => container.querySelector('[role="tab"][aria-selected="true"]').textContent.trim();
        const antes = activa();

        // Primera tarjeta del panel que apunta a otra pestaña.
        const accion = [...container.querySelectorAll('button')]
            .filter((b) => /Ver →/.test(b.textContent))
            .find((b) => b.textContent.length > 30);

        expect(accion).toBeTruthy();

        await act(async () => {
            fireEvent.click(accion);
        });

        expect(activa()).not.toBe(antes);
        expect(container.textContent).toContain('Qué hacer ahora');
    });

    it('las acciones usan las cifras del período', async () => {
        const { container } = await montar(EPIReportes, 'epi');
        // 22 observados y 20 sin cerrar vienen de METRICAS.resumen
        expect(container.textContent).toMatch(/22/);
        expect(container.textContent).toMatch(/20/);
        expect(container.textContent).not.toMatch(/\bNaN\b|\bundefined\b/i);
    });

    it('muestra los datos de la gráfica al pulsar Datos', async () => {
        await montar(EPIReportes, 'epi');
        fireEvent.click(screen.getByRole('button', { name: /Ver datos de/ }));
        expect(screen.getByRole('region', {name:/Datos · Gráfica/})).toBeTruthy();
        expect(screen.getByText('Categoría A')).toBeTruthy();
    });

    it('descarga el reporte seleccionado con la instantánea del servidor', async () => {
        const objectUrl=vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:reporte');
        const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
        await montar(GenReportes, 'general');
        fireEvent.click(screen.getByRole('tab',{name:'Evidencia de trazabilidad'}));
        await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Excel editable'})));
        expect(api.download).toHaveBeenCalledWith(expect.stringMatching(/snapshot=81b27429-e365-4b46-bc59-a3bdd29ddc51&tipo=trazabilidad&formato=xlsx/));
        expect(screen.getByRole('status').textContent).toContain('Archivo Excel preparado');
        click.mockRestore();objectUrl.mockRestore();
    });

    it('envía las fechas y la EPI elegidas al servidor', async () => {
        await montar(DptalReportes, 'dptal');
        fireEvent.change(screen.getByLabelText('Desde'), {target:{value:'2026-01-01'}});
        fireEvent.change(screen.getByLabelText('Hasta'), {target:{value:'2026-10-31'}});
        fireEvent.change(screen.getByLabelText('Estación'), {target:{value:'2'}});
        await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Aplicar filtros'})));
        expect(api.get).toHaveBeenCalledWith('/reportes?desde=2026-01-01&hasta=2026-10-31&id_epi=2');
    });

    it('una EPI no tiene selector de otras estaciones', async () => {
        await montar(EPIReportes,'epi');
        expect(screen.queryByLabelText('Estación')).toBeNull();
    });
});
