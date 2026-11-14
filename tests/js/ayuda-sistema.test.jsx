import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NAV_EPI, NAV_DEPARTAMENTAL, NAV_GENERAL } from '../../resources/js/constants/navegacion';
import { guiaDeRuta } from '../../resources/js/lib/guias';
import { animacionPausada, fuenteGuia } from '../../resources/js/components/ayuda/preferencias';

const tour = vi.hoisted(() => ({ instances: [] }));
vi.mock('../../resources/js/context/AuthContext', () => ({useAuth: () => ({user:null})}));
vi.mock('../../resources/js/components/ayuda/recorrido', () => ({
    iniciarRecorrido: vi.fn(options => {
        const instance = { options, destroy: vi.fn(() => options.onDestroyed()) };
        tour.instances.push(instance);
        return instance;
    }),
}));
import AyudaSistema from '../../resources/js/components/ayuda/AyudaSistema';

afterEach(() => { cleanup(); localStorage.clear(); sessionStorage.clear(); tour.instances.length = 0; vi.useRealTimers(); vi.restoreAllMocks(); });

describe('Ayuda institucional', () => {
    it('cubre cada módulo navegable con contenido propio y los accesos públicos', () => {
        const routes = [...NAV_EPI, ...NAV_DEPARTAMENTAL, ...NAV_GENERAL].map(item => item.path);
        const guides = routes.map(guiaDeRuta);
        expect(guides).toHaveLength(36);
        expect(guides.every(guide => guide?.summary && guide.topics.length >= 3)).toBe(true);
        expect(new Set(guides.map(guide => guide.id)).size).toBe(36);
        expect(guiaDeRuta('/login').topics.some(topic => topic.title === 'Contraseña y privacidad')).toBe(true);
        expect(guiaDeRuta('/registro-oficial/token-de-prueba').topics.some(topic => topic.title === 'Memorándum de respaldo')).toBe(true);
        expect(guiaDeRuta('/direccion-inexistente')).toBeNull();
        expect(guiaDeRuta('/').id).toBe('inicio-publico');
    });

    it('los alias conservan la ayuda del módulo y los reportes explican responsabilidades distintas', () => {
        expect(guiaDeRuta('/secretario-unidad/subir-documento/')).toBe(guiaDeRuta('/secretario/subir-documento'));
        expect(guiaDeRuta('/comando-departamental/estadisticas')).toBe(guiaDeRuta('/comando-departamental/desempenio'));
        const descriptions = ['/secretario/reportes','/comando-departamental/reportes','/comando-general/reportes'].map(path => guiaDeRuta(path).summary);
        expect(new Set(descriptions).size).toBe(3);
    });

    it('inicia directamente y destruye el recorrido al cambiar de pantalla', async () => {
        function NavigateTest() { const navigate = useNavigate(); return <button onClick={() => navigate('/secretario/reportes')}>Cambiar pantalla</button>; }
        render(<MemoryRouter initialEntries={['/login']}><NavigateTest /><AyudaSistema /></MemoryRouter>);
        expect(screen.queryByRole('dialog')).toBeNull();
        fireEvent.click(screen.getByRole('button', {name:'Ayuda de esta pantalla'}));
        await waitFor(() => expect(tour.instances).toHaveLength(1));
        expect(tour.instances[0].options.topicIndex).toBeUndefined();
        expect(tour.instances[0].options.guide.id).toBe('acceso');
        expect(screen.queryByRole('dialog')).toBeNull();
        await act(async () => fireEvent.click(screen.getByRole('button', {name:'Cambiar pantalla'})));
        expect(tour.instances[0].destroy).toHaveBeenCalled();
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(screen.getByRole('button', {name:'Ayuda de esta pantalla'})).toBeTruthy();
        fireEvent.click(screen.getByRole('button', {name:'Ayuda de esta pantalla'}));
        await waitFor(() => expect(tour.instances).toHaveLength(2));
        expect(tour.instances[1].options.guide.id).toBe('secretario-reportes');
    });

    it('ofrece un solo acceso directo sin menús de pausa o silencio', async () => {
        render(<MemoryRouter initialEntries={['/login']}><AyudaSistema /></MemoryRouter>);
        expect(screen.queryByRole('button',{name:'Opciones de Capi'})).toBeNull();
        expect(screen.queryByRole('button',{name:/Silenciar|Pausar|Activar personaje/})).toBeNull();
        fireEvent.click(screen.getByRole('button',{name:'Ayuda de esta pantalla'}));
        await waitFor(()=>expect(tour.instances).toHaveLength(1));
        expect(tour.instances[0].options.guide.id).toBe('acceso');
    });

    it('saluda y ofrece una frase cada dos minutos sin adelantar el intervalo', () => {
        vi.useFakeTimers();
        render(<MemoryRouter initialEntries={['/login']}><AyudaSistema /></MemoryRouter>);
        act(()=>vi.advanceTimersByTime(900));
        expect(screen.getByText('Hola, soy Capi. Estoy aquí para ayudarte en esta sección.')).toBeTruthy();
        act(()=>vi.advanceTimersByTime(109100));
        expect(screen.queryByRole('status')).toBeNull();
        act(()=>vi.advanceTimersByTime(9999));
        expect(screen.queryByRole('status')).toBeNull();
        act(()=>vi.advanceTimersByTime(1));
        expect(screen.getByText('¿Necesitas ayuda? Podemos recorrer esta sección juntos.')).toBeTruthy();
        act(()=>vi.advanceTimersByTime(120000));
        expect(screen.getByText('Puedo mostrarte dónde empezar. Pulsa sobre mí.')).toBeTruthy();
    });

    it('no superpone consejos mientras se escriben credenciales', () => {
        vi.useFakeTimers();
        render(<MemoryRouter initialEntries={['/login']}><input aria-label="Usuario" autoFocus /><AyudaSistema /></MemoryRouter>);
        act(()=>vi.advanceTimersByTime(120000));
        expect(screen.queryByRole('status')).toBeNull();
        expect(screen.getByRole('button',{name:'Ayuda de esta pantalla'})).toBeTruthy();
    });

    it('las antiguas preferencias manuales no ocultan al nuevo Capi', () => {
        vi.useFakeTimers();
        localStorage.setItem('policia:capi-consejos','silencio');
        localStorage.setItem('policia:guia-animacion','pausada');
        render(<MemoryRouter initialEntries={['/login']}><AyudaSistema /></MemoryRouter>);
        act(()=>vi.advanceTimersByTime(900));
        expect(screen.getByText('Hola, soy Capi. Estoy aquí para ayudarte en esta sección.')).toBeTruthy();
        expect(screen.getByRole('button',{name:'Ayuda de esta pantalla'})).toBeTruthy();
    });

    it('adapta automáticamente la imagen al movimiento reducido del sistema', () => {
        expect(fuenteGuia('izquierda')).toContain('guia-izquierda.webp');
        vi.spyOn(window,'matchMedia').mockReturnValue({matches:true});
        expect(animacionPausada()).toBe(true);
        expect(fuenteGuia('derecha')).toContain('capi-derecha.webp');
    });
});
