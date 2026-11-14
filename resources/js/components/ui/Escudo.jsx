import React from 'react';

/** Emblema oficial compartido por los tres niveles de acceso de OFBOL. */
export default function Escudo({ className = 'w-9 h-9' }) {
    return (
        <img
            src="/images/escudo-128.webp"
            srcSet="/images/escudo-128.webp 128w, /images/escudo-256.webp 256w"
            sizes="(min-width: 900px) 48px, 40px"
            width="128"
            height="170"
            alt="Escudo oficial de la Policía Boliviana"
            className={`object-contain ${className}`}
            loading="eager"
            decoding="async"
            draggable="false"
        />
    );
}
