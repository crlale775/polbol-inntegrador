import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { AuthProvider } from '../../resources/js/context/AuthContext';
import InstitutionalShell from '../../resources/js/components/InstitutionalShell';
import LayoutComandoGeneral from '../../resources/js/components/LayoutComandoGeneral';

vi.mock('../../resources/js/lib/api', () => ({ default: { get: () => Promise.resolve([]), post: () => Promise.resolve({}) } }));
vi.mock('../../resources/js/lib/prefetch', () => ({ prefetchRuta: vi.fn(), prefetchEnOcioso: () => undefined }));
afterEach(() => { cleanup(); sessionStorage.clear(); localStorage.clear(); });

it('keeps one navigation shell alive when switching screens', async () => {
    sessionStorage.setItem('ofbol_user', JSON.stringify({ id_usuario: 1, id_rol: 3, usuario: 'mando', rol: 'Comando General' }));
    render(<MemoryRouter initialEntries={['/comando-general/dashboard']}><AuthProvider><Routes>
        <Route element={<InstitutionalShell />}>
            <Route path="/comando-general/dashboard" element={<LayoutComandoGeneral><Link to="/comando-general/documentos">Abrir bandeja de prueba</Link></LayoutComandoGeneral>} />
            <Route path="/comando-general/documentos" element={<LayoutComandoGeneral><p>Contenido de bandeja de prueba</p></LayoutComandoGeneral>} />
        </Route>
    </Routes></AuthProvider></MemoryRouter>);
    const navigation = screen.getByRole('navigation', { name: 'Módulos de Comando General' });
    fireEvent.click(screen.getByText('Abrir bandeja de prueba'));
    expect(await screen.findByText('Contenido de bandeja de prueba')).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Módulos de Comando General' })).toBe(navigation);
    expect(document.querySelectorAll('aside')).toHaveLength(1);
});
