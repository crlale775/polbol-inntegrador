import React, { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ShellContext } from '../context/ShellContext';
import LayoutSecretario from './LayoutSecretario';
import LayoutComandoDepartamental from './LayoutComandoDepartamental';
import LayoutComandoGeneral from './LayoutComandoGeneral';
import ScreenSkeleton from './ui/ScreenSkeleton';

/** Persist navigation and account controls while only the working screen changes. */
export default function InstitutionalShell() {
    const { user } = useAuth();
    const Layout = Number(user?.id_rol) === 3 ? LayoutComandoGeneral
        : Number(user?.id_rol) === 2 ? LayoutComandoDepartamental : LayoutSecretario;
    return <Layout><ShellContext.Provider value><Suspense fallback={<ScreenSkeleton />}><Outlet /></Suspense></ShellContext.Provider></Layout>;
}
