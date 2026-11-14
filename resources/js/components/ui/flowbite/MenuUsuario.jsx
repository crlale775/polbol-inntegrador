import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, LogOut, UserCircle, Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import AvatarFoto from '../AvatarFoto';

/** Small account popover: keyboard focus, Escape and outside-click dismissal. */
export default function MenuUsuario({ usuario, onSalir, rutaPerfil, rutaNotificaciones }) {
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const container = useRef(null);
    const trigger = useRef(null);
    const popup = useRef(null);
    useEffect(() => {
        if (!open) return undefined;
        popup.current?.querySelector('button')?.focus();
        const outside = (event) => { if (!container.current?.contains(event.target)) setOpen(false); };
        const escape = (event) => {
            if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); }
        };
        document.addEventListener('pointerdown', outside);
        document.addEventListener('keydown', escape);
        return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
    }, [open]);
    const go = (route) => { setOpen(false); if (route) navigate(route); };
    return <div ref={container} className="ofbol-account" onBlur={(event) => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
        <button ref={trigger} type="button" className="ofbol-account-trigger" aria-label={`Menú de ${usuario?.usuario ?? 'usuario'}`}
            aria-expanded={open} onClick={() => setOpen(!open)}
            onKeyDown={(event) => { if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); } }}>
            <AvatarFoto foto={usuario?.foto} nombre={usuario?.usuario} iniciales={usuario?.usuario?.[0]?.toUpperCase() ?? 'U'} className="w-9 h-9 rounded-xl text-sm" fallbackClassName="bg-[#285343] text-white" />
            <span className="hidden sm:block"><strong>{usuario?.usuario ?? 'Usuario'}</strong><small>Mi cuenta</small></span>
            <ChevronDown size={14} aria-hidden="true" />
        </button>
        {open && <div ref={popup} className="ofbol-account-popup" role="group" aria-label="Acciones de cuenta">
            <p>{usuario?.rol ?? 'Cuenta institucional'}</p>
            {rutaPerfil && <button onClick={() => go(rutaPerfil)}><UserCircle size={17} aria-hidden="true" />Mi perfil</button>}
            {rutaNotificaciones && <button onClick={() => go(rutaNotificaciones)}><Bell size={17} aria-hidden="true" />Notificaciones</button>}
            <button className="ofbol-account-logout" onClick={() => { setOpen(false); void onSalir(); }}><LogOut size={17} aria-hidden="true" />Cerrar sesión</button>
        </div>}
    </div>;
}
