// Excel interpreta fórmulas incluso en celdas CSV entre comillas.
export function celdaCsv(valor) {
    const texto = String(valor ?? '');
    const protegido = /^[\s\uFEFF]*[=+\-@]/u.test(texto) || /^[\t\r\n]/u.test(texto) ? `'${texto}` : texto;
    return `"${protegido.replace(/"/g, '""')}"`;
}

export function contenidoCsv(filas) {
    return '\uFEFF' + filas.map(fila => fila.map(celdaCsv).join(';')).join('\r\n');
}

export function descargarCsv(filas, nombre) {
    const url = URL.createObjectURL(new Blob([contenidoCsv(filas)], { type: 'text/csv;charset=utf-8' }));
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = nombre;
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
