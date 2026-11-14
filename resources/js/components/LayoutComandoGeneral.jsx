/**
 * LayoutComandoGeneral — Shell institucional OFBOL del Comando General de la
 * Policía Boliviana. Usa el caparazón compartido (SidebarShell) con acento
 * oliva institucional y sus módulos propios.
 */
import React, { useContext } from 'react';
import { ShellContext } from '../context/ShellContext';
import SidebarShell from './SidebarShell';
import { NAV_GENERAL as NAV_ITEMS } from '../constants/navegacion';

export default function LayoutComandoGeneral({ children }) {
    const existingShell = useContext(ShellContext);
    if (existingShell) return children;
    return (
        <SidebarShell
            navItems={NAV_ITEMS}
            nombreRol="Comando General"
            subtituloRol="Comando General"
            acento="#8a9a6d"
            acentoSuave="rgba(138, 154, 109, 0.28)"
            badgeInferior={{ clave: 'general', etiqueta: 'Jurisdicción', valor: 'Dirección de Personal' }}
        >
            {children}
        </SidebarShell>
    );
}
