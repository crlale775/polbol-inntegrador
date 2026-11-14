import React from 'react';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AuthProvider } from '../../resources/js/context/AuthContext';
import ComparativoGeneral from '../../resources/views/comando_general/ComparativoGeneral';
import DesempenioEpis from '../../resources/views/secretario_comando_departamental/DesempenioEpis';
import GeneralDashboard from '../../resources/views/comando_general/Dashboard';

const api = vi.hoisted(() => ({ load: vi.fn(), panel: vi.fn(), requests: vi.fn() }));
vi.mock('../../resources/js/lib/api', () => ({ default: {
    get: (path) => {
        api.requests(path);
        if (path === '/desempenio-epis') return api.load();
        if (path === '/panel/general') return api.panel();
        return Promise.resolve([]);
    },
    post: () => Promise.resolve({}),
} }));
vi.mock('../../resources/js/lib/prefetch', () => ({ prefetchRuta: vi.fn(), prefetchEnOcioso: () => undefined }));

const zones = ['San Pedro', 'Sur', 'Ferroviaria', 'Munaypata', 'Cotahuma', 'Chijini', 'Centro', 'Bosquecillo', 'Merced'];
const epis = zones.map((zone, i) => ({
    id_epi: i + 1, nombre: `EPI ${i + 1} ${zone}`, codigo: `EPI-${i + 1}`, ubicacion: `Zona ${zone}`,
    secretario: { usuario: `secretaria_${i + 1}`, foto: null },
    metricas: { total_documentos: 10 + i, en_revision: 1, observados: i % 2 === 0 ? 1 : 0, aprobados: 5 + i, registrados: 2 + i, tasa_aprobacion: 50 + i, tasa_observacion: 10, tiempo_promedio_horas: 12 },
    por_tipo_detalle: [{ id_tipo: 1, tipo: 'Designación', total: 10 + i, aprobados: 5 + i, observados: 1 }],
    top_receptores: [{ id_oficial: i + 1, nombres: 'Oficial', apellidos: `Prueba ${i + 1}`, grado: 'Sgto.', total: 2, tipo_principal: 'Designación' }],
}));
const payload = {
    epis,
    resumen_global: { total: 126, aprobados: 81, observados: 5, en_proceso: 9, registrados: 54, epis_activas: 9, epis_con_carga: 9, tasa_aprobacion: 64.3 },
    por_estado: [{ estado: 'Aprobado', total: 81 }],
    tipos_mas_usados: [{ id_tipo: 1, tipo: 'Designación', total: 126, aprobados: 81, observados: 5, epi_principal: 'EPI 9 Merced' }],
    top_receptores_global: [],
};

beforeEach(() => {
    api.load.mockReset().mockResolvedValue(payload);
    api.panel.mockReset().mockResolvedValue({
        resumen: { total: 126 }, por_estado: [], por_tipo: [], recientes: [],
        por_epi: epis.map((epi) => ({ id_epi: epi.id_epi, nombre: epi.nombre, ...epi.metricas, total: epi.metricas.total_documentos })),
    });
    api.requests.mockClear();
    sessionStorage.setItem('ofbol_user', JSON.stringify({ id_usuario: 3, id_rol: 3, rol: 'Comando General', usuario: 'mando_prueba' }));
});
afterEach(() => { cleanup(); sessionStorage.clear(); localStorage.clear(); });

function mount(Component = ComparativoGeneral, path = '/comando-general/comparativo') {
    return render(<MemoryRouter initialEntries={[path]}><AuthProvider><Component /></AuthProvider></MemoryRouter>);
}
const buildings = () => screen.getAllByRole('button', { name: /^Abrir documentos de EPI/ });

it('renders all nine buildings from the real consolidated object contract', async () => {
    mount();
    expect(await screen.findByRole('region', { name: 'Campus operativo de EPIs' })).toBeTruthy();
    expect(buildings()).toHaveLength(9);
    expect(api.requests).not.toHaveBeenCalledWith('/estadisticas-generales');
    expect(screen.getByText('Distribución por estado')).toBeTruthy();
});

it('selects an EPI by keyboard-compatible button and exposes its actual details', async () => {
    mount();
    const button = await screen.findByRole('button', { name: /Abrir documentos de EPI 2 Sur/ });
    fireEvent.click(button);
    expect(await screen.findByRole('heading', { name: /EPI 2 Sur/, level: 2 })).toBeTruthy();
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(within(screen.getByRole('region', { name: 'Detalle de EPI 2 Sur' })).getByText('secretaria_2')).toBeTruthy();
});

it('filters stations, recovers zero matches and switches to an interactive list', async () => {
    mount();
    await screen.findByRole('region', { name: 'Campus operativo de EPIs' });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar estación' }), { target: { value: 'Sur' } });
    expect(buildings()).toHaveLength(1);
    fireEvent.change(screen.getByRole('combobox', { name: 'Filtrar estaciones por estado' }), { target: { value: 'observadas' } });
    expect(screen.getByText('Ninguna estación coincide con los filtros')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar todas las estaciones' }));
    expect(buildings()).toHaveLength(9);
    fireEvent.click(screen.getByRole('button', { name: 'Lista' }));
    expect(screen.queryAllByRole('button', { name: /^Abrir documentos de EPI/ })).toHaveLength(0);
    const campus = screen.getByRole('region', { name: 'Campus operativo de EPIs' });
    fireEvent.click(within(campus).getByRole('button', { name: /^EPI 5 Cotahuma/ }));
    expect(screen.getByRole('heading', { name: /EPI 5 Cotahuma/, level: 2 })).toBeTruthy();
});

it('keeps a deep link to the selected EPI', async () => {
    mount(ComparativoGeneral, '/comando-general/comparativo?epi=4');
    expect(await screen.findByRole('heading', { name: /EPI 4 Munaypata/, level: 2 })).toBeTruthy();
});

it('shows a retry action instead of an empty screen when the contract is wrong', async () => {
    api.load.mockResolvedValueOnce([]).mockResolvedValue(payload);
    mount();
    expect(await screen.findByText('No se pudo mostrar el campus de EPIs')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Volver a consultar' }));
    await screen.findByRole('region', { name: 'Campus operativo de EPIs' });
    expect(buildings()).toHaveLength(9);
});

it('shows recoverable network failures', async () => {
    api.load.mockRejectedValueOnce(new Error('Sin conexión de prueba'));
    mount();
    expect(await screen.findByText('Sin conexión de prueba')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Volver a consultar' })).toBeTruthy();
});

it('uses the same functioning campus for the departmental command', async () => {
    sessionStorage.setItem('ofbol_user', JSON.stringify({ id_usuario: 2, id_rol: 2, rol: 'Comando Departamental', usuario: 'mando_dptal_prueba' }));
    mount(DesempenioEpis, '/comando-departamental/desempenio');
    await screen.findByRole('region', { name: 'Campus operativo de EPIs' });
    expect(buildings()).toHaveLength(9);
});

it('opens the selected station from the general home screen', async () => {
    render(<MemoryRouter initialEntries={['/comando-general/dashboard']}><AuthProvider><Routes>
        <Route path="/comando-general/dashboard" element={<GeneralDashboard />} />
        <Route path="/comando-general/comparativo" element={<ComparativoGeneral />} />
    </Routes></AuthProvider></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: /Abrir documentos de EPI 6 Chijini/ }));
    expect(await screen.findByRole('heading', { name: /EPI 6 Chijini/, level: 2 })).toBeTruthy();
});
