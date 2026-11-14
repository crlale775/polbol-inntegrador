/** Kept separate so a navigation button never imports cmdk or its dialog. */
export const abrirPaleta = () => window.dispatchEvent(new Event('ofbol:paleta'));
