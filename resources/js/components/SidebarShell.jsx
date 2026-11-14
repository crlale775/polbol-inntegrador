import React, { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, PanelLeftClose, PanelLeftOpen, Bell, Search, Menu, X, MapPin, ChevronRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSyncGlobal, ChipEnVivo } from './ui/ToastEnVivo';
import Escudo from './ui/Escudo';
import MenuUsuario from './ui/flowbite/MenuUsuario';
import api from '../lib/api';
import { prefetchRuta, prefetchEnOcioso } from '../lib/prefetch';
import { abrirPaleta } from '../lib/commandEvents';

function groupFor(item) {
    if (/perfil|notificaciones/.test(item.path)) return 'Mi cuenta';
    if (/usuarios|secretarios|registro-oficiales|tipos-memo|auditoria|copias-seguridad/.test(item.path)) return 'Administración';
    if (/reportes|desempenio|comparativo|historial|trazabilidad/.test(item.path)) return 'Análisis y seguimiento';
    return 'Operación documental';
}

export default function SidebarShell({ navItems, nombreRol, subtituloRol, badgeInferior, children, notificacionesIniciales = 0 }) {
    const { user, logout } = useAuth();
    const { conectado, resumenEpi } = useSyncGlobal();
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const menuButton = useRef(null);
    const aside = useRef(null);
    const [compact, setCompact] = useState(() => {
        try { return sessionStorage.getItem('ofbol:sidebar-compact') === '1'; } catch { return false; }
    });
    const [mobile, setMobile] = useState(() => window.matchMedia?.('(max-width: 900px)').matches ?? false);
    const [drawer, setDrawer] = useState(false);
    const [notifCount, setNotifCount] = useState(notificacionesIniciales);
    const current = navItems.find((item) => item.path === pathname) ?? navItems[0];
    const notifications = navItems.find((item) => /notificaciones/.test(item.path));
    const groups = ['Operación documental', 'Análisis y seguimiento', 'Administración', 'Mi cuenta']
        .filter((group) => navItems.some((item) => groupFor(item) === group));

    useEffect(() => {
        const media = window.matchMedia?.('(max-width: 900px)');
        const update = () => setMobile(media?.matches ?? false);
        media?.addEventListener?.('change', update);
        return () => media?.removeEventListener?.('change', update);
    }, []);
    useEffect(() => {
        try { sessionStorage.setItem('ofbol:sidebar-compact', compact ? '1' : '0'); } catch { /* storage optional */ }
    }, [compact]);
    useEffect(() => prefetchEnOcioso(navItems.slice(0, 3).map((item) => item.path)), [navItems]);
    useEffect(() => {
        let active = true;
        if (user?.id_usuario) api.get(`/notificaciones?id_usuario=${user.id_usuario}`)
            .then((items) => { if (active && Array.isArray(items)) setNotifCount(items.filter((item) => !item.leido).length); })
            .catch(() => {});
        return () => { active = false; };
    }, [user?.id_usuario]);
    useEffect(() => {
        if (!mobile || !drawer) return undefined;
        const panel = aside.current;
        const focusable = () => [...panel.querySelectorAll('a[href], button:not(:disabled)')];
        focusable()[0]?.focus();
        const keydown = (event) => {
            if (event.key === 'Escape') { setDrawer(false); menuButton.current?.focus(); }
            if (event.key !== 'Tab') return;
            const items = focusable();
            if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus(); }
            else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0]?.focus(); }
        };
        document.addEventListener('keydown', keydown);
        return () => document.removeEventListener('keydown', keydown);
    }, [mobile, drawer]);

    const logoutAndNavigate = async () => { if (await logout()) navigate('/login', { replace: true }); };
    const scope = typeof user?.epi === 'string' && badgeInferior?.clave === 'unidad' ? user.epi : badgeInferior?.valor;
    const pending = resumenEpi.reduce((sum, epi) => sum + (badgeInferior?.clave === 'departamental' ? epi.en_revision ?? 0 : epi.por_validar ?? 0), 0);
    const collapsed = compact && !mobile;

    return (
        <div className={`ofbol-shell ${collapsed ? 'ofbol-shell--compact' : ''}`}>
            {mobile && drawer && <button className="ofbol-shell-scrim" tabIndex={-1} aria-label="Cerrar menú" onClick={() => { setDrawer(false); menuButton.current?.focus(); }} />}
            <aside ref={aside} className={`ofbol-shell-sidebar ${drawer ? 'ofbol-shell-sidebar--open' : ''}`}
                inert={mobile && !drawer} role={mobile && drawer ? 'dialog' : undefined}
                aria-modal={mobile && drawer ? true : undefined} aria-label="Navegación institucional">
                <div className="ofbol-shell-brand">
                    <Escudo className="w-10 h-12 shrink-0" />
                    {!collapsed && <div className="min-w-0"><strong>Policía<span>Boliviana</span></strong></div>}
                    {!collapsed && <button className="ofbol-shell-icon ofbol-shell-collapse" aria-label={mobile ? 'Cerrar menú' : 'Contraer sidebar'} onClick={() => { if (mobile) { setDrawer(false); menuButton.current?.focus(); } else setCompact(true); }}>{mobile ? <X size={18} /> : <PanelLeftClose size={18} />}</button>}
                </div>
                {!collapsed && <div className="ofbol-shell-role"><span>Espacio de trabajo</span><p>{subtituloRol || nombreRol}</p></div>}
                <nav className="ofbol-shell-nav" aria-label={`Módulos de ${nombreRol}`}>
                    {groups.map((group) => <div key={group} className="ofbol-shell-group">
                        {!collapsed && <p className="ofbol-shell-group-label">{group}</p>}
                        {navItems.filter((item) => groupFor(item) === group).map((item) => {
                            const count = /notificaciones/.test(item.path) ? notifCount : item.badge === 'pendientes' ? pending : 0;
                            return <NavLink key={item.path} to={item.path} title={collapsed ? item.label : undefined}
                                aria-label={collapsed ? item.label : undefined}
                                className={({ isActive }) => `ofbol-shell-link ${isActive ? 'ofbol-shell-link--active' : ''}`}
                                onClick={() => setDrawer(false)} onMouseEnter={() => prefetchRuta(item.path)} onFocus={() => prefetchRuta(item.path)}>
                                <item.icono size={18} strokeWidth={1.8} aria-hidden="true" />
                                {!collapsed && <><span>{item.label}</span>{count > 0 && <span className="ofbol-shell-count">{count}</span>}</>}
                            </NavLink>;
                        })}
                    </div>)}
                </nav>
                <div className="ofbol-shell-bottom">
                    {!collapsed && scope && <div className="ofbol-shell-scope"><MapPin size={15} aria-hidden="true" /><div><span>{badgeInferior?.etiqueta || 'Unidad asignada'}</span><p>{scope}</p></div></div>}
                    {collapsed && <button className="ofbol-shell-icon" aria-label="Expandir sidebar" onClick={() => setCompact(false)}><PanelLeftOpen size={18} /></button>}
                    <button className="ofbol-shell-exit" aria-label="Cerrar sesión" onClick={logoutAndNavigate}><LogOut size={17} aria-hidden="true" />{!collapsed && 'Cerrar sesión'}</button>
                </div>
            </aside>
            <div className="ofbol-shell-body">
                <header className="ofbol-shell-header">
                    {mobile && <button ref={menuButton} className="ofbol-shell-icon" aria-label="Abrir menú de módulos" aria-expanded={drawer} onClick={() => setDrawer(true)}><Menu size={21} /></button>}
                    <div className="ofbol-shell-breadcrumb"><span className="hidden md:inline">{nombreRol}</span><ChevronRight className="hidden md:inline" size={14} aria-hidden="true" /><strong>{current?.label}</strong></div>
                    <div className="ofbol-shell-tools">
                        <button className="ofbol-shell-search" aria-label="Buscar módulos (Ctrl+K)" onClick={abrirPaleta}><Search size={17} aria-hidden="true" /><span className="hidden lg:inline">Buscar un módulo</span><kbd className="ofbol-kbd hidden lg:inline">Ctrl K</kbd></button>
                        <span className="hidden xl:inline-flex"><ChipEnVivo conectado={conectado} /></span>
                        {notifications && <NavLink to={notifications.path} className="ofbol-shell-icon ofbol-shell-bell" aria-label={`Notificaciones${notifCount ? ` (${notifCount} sin leer)` : ''}`}><Bell size={19} />{notifCount > 0 && <i />}</NavLink>}
                        <MenuUsuario usuario={user} onSalir={logoutAndNavigate} rutaPerfil={navItems.find((item) => /perfil/.test(item.path))?.path} rutaNotificaciones={notifications?.path} />
                    </div>
                </header>
                <main id="main-content" tabIndex={-1} className="ofbol-workspace flex-1 overflow-y-auto">{children}</main>
            </div>
        </div>
    );
}
