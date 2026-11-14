import React from 'react';

export const CURVA = [0.16, 1, 0.3, 1];

/** Stable wrapper: route changes must never key/remount the entire application. */
export function TransicionPagina({ ruta, children }) {
    return <div data-route={ruta} style={{ minHeight: '100%' }}>{children}</div>;
}

/** CSS handles reduced motion, with no animation runtime on the login path. */
export function Aparicion({ children, retraso = 0, className = '' }) {
    return <div className={`ofbol-animate-slide-up ${className}`} style={{ animationDelay: `${retraso}s` }}>{children}</div>;
}
