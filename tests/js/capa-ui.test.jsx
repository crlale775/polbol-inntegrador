/**
 * Pruebas de la capa de interfaz compartida (motion · cmdk · lucide).
 *
 * `vistas.test.jsx` monta cada vista, pero no la paleta ni la transición de
 * página, que viven en el shell. Estas pruebas evitan que una actualización de
 * esas librerías rompa el atajo, el filtrado por rol o la accesibilidad de las
 * cifras sin que nadie se entere.
 */
import React from 'react';
import { render, screen, act, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, afterEach } from 'vitest';

import { AuthProvider } from '../../resources/js/context/AuthContext';
import CommandPalette from '../../resources/js/components/ui/CommandPalette';
import CountUp from '../../resources/js/components/ui/CountUp';
import { TransicionPagina } from '../../resources/js/components/ui/motion/Pagina';
import MenuUsuario from '../../resources/js/components/ui/flowbite/MenuUsuario';

vi.mock('../../resources/js/lib/api.js', () => ({
    default: {
        get: () => Promise.resolve([]),
        post: () => Promise.resolve({}),
        put: () => Promise.resolve({}),
        patch: () => Promise.resolve({}),
        delete: () => Promise.resolve({}),
        upload: () => Promise.resolve({}),
    },
}));

const USUARIO = {
    id_usuario: 1,
    usuario: 'sec_sanpedro',
    rol: 'Secretario EPI',
    id_epi: 1,
    epi: 'EPI 1 San Pedro',
    estado: true,
};

afterEach(() => {
    cleanup();
    sessionStorage.clear();
    localStorage.clear();
});

describe('Capa de interfaz compartida', () => {
    it('el menú real de cuenta se abre y permite cerrar sesión', async () => {
        const salir = vi.fn();
        render(
            <MemoryRouter>
                <MenuUsuario usuario={USUARIO} onSalir={salir}
                    rutaPerfil="/secretario/perfil" rutaNotificaciones="/secretario/notificaciones" />
            </MemoryRouter>
        );
        fireEvent.click(screen.getByRole('button', { name: `Menú de ${USUARIO.usuario}` }));
        const cerrar = await screen.findByRole('button', { name: 'Cerrar sesión' });
        expect(screen.getByRole('button', { name: 'Mi perfil' })).toBeTruthy();
        fireEvent.click(cerrar);
        expect(salir).toHaveBeenCalledTimes(1);
    });
    it('la paleta se abre con el evento global y lista los módulos del rol', async () => {
        sessionStorage.setItem('ofbol_user', JSON.stringify(USUARIO));

        render(
            <MemoryRouter initialEntries={['/secretario/dashboard']}>
                <AuthProvider>
                    <CommandPalette />
                </AuthProvider>
            </MemoryRouter>
        );

        await act(async () => {
            window.dispatchEvent(new Event('ofbol:paleta'));
        });

        expect(await screen.findByPlaceholderText('Buscar módulo o acción…')).toBeTruthy();
        expect(screen.getByText('Subir Documento')).toBeTruthy();
        expect(screen.getByText('Cerrar sesión')).toBeTruthy();
    });

    it('CountUp publica el valor final como texto accesible', () => {
        const { container } = render(<CountUp valor="42%" />);
        expect(container.querySelector('[aria-label="42%"]')).not.toBeNull();
    });

    it('la transición de página entrega el contenido de la vista', () => {
        const { container } = render(
            <TransicionPagina ruta="/secretario/dashboard">
                <p>contenido de la vista</p>
            </TransicionPagina>
        );

        expect(container.textContent).toContain('contenido de la vista');
    });
});
