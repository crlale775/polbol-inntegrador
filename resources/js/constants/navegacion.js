/**
 * Registro único de navegación por rol.
 *
 * Antes cada layout declaraba su propia lista y la paleta de comandos habría
 * necesitado una cuarta copia. Ahora hay una sola fuente de verdad: si se
 * agrega un módulo, aparece en el sidebar y en el buscador a la vez.
 */
import {
    Home, UploadCloud, FolderOpen, PencilLine, Users, History, FileText,
    BarChart3, Bell, UserCircle, ClipboardCheck, AlertTriangle, GitBranch,
    TrendingUp, Inbox, Layers, BookOpen, UserPlus, ScrollText, DatabaseBackup,
} from 'lucide-react';

export const NAV_EPI = [
    { path: '/secretario/dashboard', label: 'Inicio', icono: Home },
    { path: '/secretario/subir-documento', label: 'Subir Documento', icono: UploadCloud },
    { path: '/secretario/mis-documentos', label: 'Mis Documentos', icono: FolderOpen },
    { path: '/secretario/correcciones', label: 'Correcciones', icono: PencilLine },
    { path: '/secretario/oficiales', label: 'Personal de la EPI', icono: Users },
    { path: '/secretario/historial', label: 'Historial', icono: History },
    { path: '/secretario/plantillas', label: 'Plantillas Oficiales', icono: FileText },
    { path: '/secretario/reportes', label: 'Reportes', icono: BarChart3 },
    { path: '/secretario/notificaciones', label: 'Notificaciones', icono: Bell, badge: true },
    { path: '/secretario/perfil', label: 'Mi Perfil', icono: UserCircle },
];

export const NAV_DEPARTAMENTAL = [
    { path: '/comando-departamental/dashboard', label: 'Inicio', icono: Home },
    { path: '/comando-departamental/revision', label: 'Cola de Revisión', icono: ClipboardCheck, badge: 'pendientes' },
    { path: '/comando-departamental/observaciones', label: 'Observaciones', icono: AlertTriangle },
    { path: '/comando-departamental/historial', label: 'Historial', icono: History },
    { path: '/comando-departamental/trazabilidad', label: 'Recorrido del Trámite', icono: GitBranch },
    { path: '/comando-departamental/documentos-epi', label: 'Documentos por EPI', icono: FolderOpen },
    { path: '/comando-departamental/desempenio', label: 'Desempeño y Estadísticas', icono: TrendingUp },
    { path: '/comando-departamental/secretarios', label: 'Gestión Secretarios EPI', icono: Users },
    { path: '/comando-departamental/reportes', label: 'Reportes y Cifras', icono: BarChart3 },
    { path: '/comando-departamental/notificaciones', label: 'Notificaciones', icono: Bell, badge: 'notif' },
    { path: '/comando-departamental/perfil', label: 'Mi Perfil', icono: UserCircle },
];

export const NAV_GENERAL = [
    { path: '/comando-general/dashboard', label: 'Inicio', icono: Home },
    { path: '/comando-general/documentos', label: 'Bandeja de Entrada', icono: Inbox, badge: 'pendientes' },
    { path: '/comando-general/registro', label: 'Registro Documental', icono: FileText },
    { path: '/comando-general/tipos-memo', label: 'Tipos de Memorándum', icono: Layers },
    { path: '/comando-general/historial', label: 'Historial General', icono: History },
    { path: '/comando-general/trazabilidad', label: 'Recorrido del Trámite', icono: GitBranch },
    { path: '/comando-general/comparativo', label: 'Desempeño de EPIs', icono: TrendingUp },
    { path: '/comando-general/directorio', label: 'Directorio Policial', icono: BookOpen },
    { path: '/comando-general/registro-oficiales', label: 'Registro Oficiales · IA', icono: UserPlus },
    { path: '/comando-general/usuarios', label: 'Gestión de Usuarios', icono: Users },
    { path: '/comando-general/auditoria', label: 'Registro de Actividad', icono: ScrollText },
    { path: '/comando-general/copias-seguridad', label: 'Copias de Seguridad', icono: DatabaseBackup },
    { path: '/comando-general/reportes', label: 'Reportes y Cifras', icono: BarChart3 },
    { path: '/comando-general/notificaciones', label: 'Notificaciones', icono: Bell, badge: 'notif' },
    { path: '/comando-general/perfil', label: 'Mi Perfil', icono: UserCircle },
];

/** Navegación que corresponde al rol autenticado (con su acento institucional). */
export function navDelRol(rol = '') {
    const r = String(rol).toLowerCase();

    if (r.includes('general')) {
        return { clave: 'general', nombre: 'Comando General', acento: '#8a9a6d', items: NAV_GENERAL };
    }
    if (r.includes('departamental')) {
        return { clave: 'departamental', nombre: 'Comando Departamental', acento: '#9a6f0a', items: NAV_DEPARTAMENTAL };
    }
    return { clave: 'epi', nombre: 'Secretaría EPI', acento: '#8a9a6d', items: NAV_EPI };
}
