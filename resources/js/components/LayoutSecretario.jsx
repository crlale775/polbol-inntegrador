import React, { useContext } from 'react';
import { ShellContext } from '../context/ShellContext';
import SidebarShell from './SidebarShell';
import { NAV_EPI } from '../constants/navegacion';

export default function LayoutSecretario({ children, notifCount = 0 }) {
    const existingShell = useContext(ShellContext);
    if (existingShell) return children;
    return <SidebarShell navItems={NAV_EPI} nombreRol="Secretaría EPI" subtituloRol="Secretaría de unidad"
        notificacionesIniciales={notifCount}
        badgeInferior={{ clave: 'unidad', etiqueta: 'Unidad asignada', valor: 'Secretaría EPI' }}>
        {children}
    </SidebarShell>;
}
