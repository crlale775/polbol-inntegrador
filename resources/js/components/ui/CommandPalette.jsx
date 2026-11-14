/**
 * CommandPalette — buscador global de módulos y acciones.
 *
 * Piezas: cmdk (patrón Command de shadcn/ui) para el filtrado y la navegación
 * por teclado, Radix Dialog (vía cmdk) para el foco y el portal, `lucide` para
 * los iconos, `@mantine/hooks` para los atajos y el registro único de
 * navegación por rol.
 *
 * Se abre con Ctrl+K / ⌘K o con el botón de la barra superior.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Command } from 'cmdk';
import { useNavigate } from 'react-router-dom';
import { useHotkeys } from '@mantine/hooks';
import { Search, CornerDownLeft, LogOut, Bell, Home, UserCircle, UploadCloud } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { navDelRol } from '../../constants/navegacion';

/** Abre la paleta desde cualquier parte (botón de la topbar). */
export { abrirPaleta } from '../../lib/commandEvents';

export default function CommandPalette({ initialOpen = false }) {
    const [abierto, setAbierto] = useState(initialOpen);
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const { items, nombre } = navDelRol(user?.rol ?? '');

    const alternar = () => setAbierto((previo) => !previo);
    useHotkeys([['ctrl+K', alternar], ['meta+K', alternar]]);

    useEffect(() => {
        const abrir = () => setAbierto(true);
        window.addEventListener('ofbol:paleta', abrir);
        return () => window.removeEventListener('ofbol:paleta', abrir);
    }, []);

    useEffect(() => {
        if (!abierto) return undefined;
        const cerrarConEscape = (e) => {
            if (e.key === 'Escape') setAbierto(false);
        };
        document.addEventListener('keydown', cerrarConEscape);
        return () => document.removeEventListener('keydown', cerrarConEscape);
    }, [abierto]);

    const acciones = useMemo(() => {
        const perfil = items.find((i) => /perfil/.test(i.path))?.path;
        const notificaciones = items.find((i) => /notificaciones/.test(i.path))?.path;
        const esSecretaria = /secretar/i.test(user?.rol ?? '');

        return [
            { etiqueta: 'Ir al inicio', ruta: items[0]?.path, Icono: Home },
            esSecretaria ? { etiqueta: 'Subir documento', ruta: '/secretario/subir-documento', Icono: UploadCloud } : null,
            { etiqueta: 'Mi perfil', ruta: perfil, Icono: UserCircle },
            { etiqueta: 'Notificaciones', ruta: notificaciones, Icono: Bell },
        ].filter((a) => a && a.ruta);
    }, [items, user?.rol]);

    const ir = (ruta) => {
        setAbierto(false);
        navigate(ruta);
    };

    if (!abierto) return null;

    return (
        <Command.Dialog
            open={abierto}
            onOpenChange={setAbierto}
            label="Buscador de módulos de la Policía Boliviana"
            overlayClassName="fixed inset-0 z-[80] bg-[rgba(20,24,26,0.42)] backdrop-blur-[3px] ofbol-animate-fade-in"
            contentClassName="fixed left-1/2 top-[16%] z-[90] w-[min(92vw,560px)] -translate-x-1/2 ofbol-elevated ofbol-animate-scale-in overflow-hidden"
        >
            <div className="flex h-12 items-center gap-2 px-4" style={{ borderBottom: '1px solid var(--ofbol-line)' }}>
                <Search size={15} strokeWidth={2} aria-hidden="true" style={{ color: 'var(--ofbol-slate)' }} />
                <Command.Input
                    autoFocus
                    placeholder="Buscar módulo o acción…"
                    className="h-full flex-1 bg-transparent text-[13px] font-medium outline-none placeholder:text-slate-400"
                    style={{ color: 'var(--ofbol-ink)' }}
                />
                <kbd className="ofbol-kbd">ESC</kbd>
            </div>

            <Command.List className="ofbol-cmd ofbol-scroll max-h-[52vh] overflow-y-auto p-2">
                <Command.Empty className="px-3 py-8 text-center text-[12px] font-semibold text-slate-500">
                    Sin resultados para esa búsqueda.
                </Command.Empty>

                <Command.Group heading={`Módulos · ${nombre}`}>
                    {items.map(({ path, label, icono: Icono }) => (
                        <Command.Item
                            key={path}
                            value={`${label} ${path}`}
                            onSelect={() => ir(path)}
                            className="ofbol-cmd-item"
                        >
                            <Icono size={14} strokeWidth={1.9} aria-hidden="true" />
                            <span className="flex-1 truncate">{label}</span>
                            <CornerDownLeft size={11} className="ofbol-cmd-pista" aria-hidden="true" />
                        </Command.Item>
                    ))}
                </Command.Group>

                <Command.Group heading="Acciones">
                    {acciones.map(({ etiqueta, ruta, Icono }) => (
                        <Command.Item
                            key={etiqueta}
                            value={`${etiqueta} ${ruta}`}
                            onSelect={() => ir(ruta)}
                            className="ofbol-cmd-item"
                        >
                            <Icono size={14} strokeWidth={1.9} aria-hidden="true" />
                            <span className="flex-1 truncate">{etiqueta}</span>
                            <CornerDownLeft size={11} className="ofbol-cmd-pista" aria-hidden="true" />
                        </Command.Item>
                    ))}

                    <Command.Item
                        value="cerrar sesion salir logout"
                        onSelect={async () => {
                            setAbierto(false);
                            if (await logout()) navigate('/login', { replace: true });
                        }}
                        className="ofbol-cmd-item ofbol-cmd-item--peligro"
                    >
                        <LogOut size={14} strokeWidth={1.9} aria-hidden="true" />
                        <span className="flex-1 truncate">Cerrar sesión</span>
                    </Command.Item>
                </Command.Group>
            </Command.List>

            <footer
                className="flex h-9 items-center gap-3 px-4 text-[10px] font-semibold"
                style={{ borderTop: '1px solid var(--ofbol-line)', color: 'var(--ofbol-muted)' }}
            >
                <span><kbd className="ofbol-kbd">↑</kbd> <kbd className="ofbol-kbd">↓</kbd> navegar</span>
                <span><kbd className="ofbol-kbd">↵</kbd> abrir</span>
                <span className="ml-auto">{user?.rol ?? 'Policía Boliviana'}</span>
            </footer>
        </Command.Dialog>
    );
}
