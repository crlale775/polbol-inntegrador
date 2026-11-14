import React from 'react';

/** Keep navigation visible while a route's code is arriving. */
export default function ScreenSkeleton() {
    return <div className="ofbol-screen-skeleton p-6 lg:p-8 max-w-7xl mx-auto" role="status" aria-label="Cargando pantalla">
        <p className="sr-only">Cargando pantalla…</p>
        <div aria-hidden="true" className="space-y-6">
            <div className="space-y-3"><div className="ofbol-skeleton h-8 w-2/3 rounded" /><div className="ofbol-skeleton h-4 w-1/2 rounded" /></div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">{[0, 1, 2].map((i) => <div key={i} className="ofbol-skeleton h-32 rounded-xl" />)}</div>
            <div className="ofbol-card p-5 space-y-4"><div className="ofbol-skeleton h-6 w-1/3 rounded" />{[0, 1, 2, 3, 4].map((i) => <div key={i} className="ofbol-skeleton h-10 w-full rounded" />)}</div>
        </div>
    </div>;
}
