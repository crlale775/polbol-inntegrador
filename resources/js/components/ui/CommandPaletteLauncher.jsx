import React, { lazy, Suspense, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';

const CommandPalette = lazy(() => import('./CommandPalette'));

/** Download the search dialog on its first click or keyboard shortcut. */
export default function CommandPaletteLauncher() {
    const { user } = useAuth();
    const [active, setActive] = useState(false);
    useEffect(() => { setActive(false); }, [user?.id_usuario]);
    useEffect(() => {
        if (!user || active) return undefined;
        const open = () => setActive(true);
        const shortcut = (event) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
                event.preventDefault();
                open();
            }
        };
        window.addEventListener('ofbol:paleta', open);
        window.addEventListener('keydown', shortcut);
        return () => {
            window.removeEventListener('ofbol:paleta', open);
            window.removeEventListener('keydown', shortcut);
        };
    }, [user, active]);
    if (!user || !active) return null;
    return <Suspense fallback={null}><CommandPalette initialOpen /></Suspense>;
}
