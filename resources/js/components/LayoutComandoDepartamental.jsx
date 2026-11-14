/**
 * LayoutComandoDepartamental — Shell institucional OFBOL del Comando
 * Departamental de La Paz. Usa el caparazón compartido (SidebarShell) con
 * acento ámbar institucional y sus módulos propios.
 */
import React, { useContext } from 'react';
import { ShellContext } from '../context/ShellContext';
import SidebarShell from './SidebarShell';
import { NAV_DEPARTAMENTAL as NAV_ITEMS } from '../constants/navegacion';

export default function LayoutComandoDepartamental({ children }) {
    const existingShell = useContext(ShellContext);
    if (existingShell) return children;
    return (
        <SidebarShell
            navItems={NAV_ITEMS}
            nombreRol="Comando Departamental"
            subtituloRol="Comando Departamental"
            acento="#9a6f0a"
            acentoSuave="rgba(154, 111, 10, 0.28)"
            badgeInferior={{ clave: 'departamental', etiqueta: 'Jurisdicción', valor: 'Comando Dptal. La Paz (9 EPIs)' }}
        >
            {children}
        </SidebarShell>
    );
}
