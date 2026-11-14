// Una referencia de revisión identifica una lectura temporal de esta cuenta.
// Al cambiar el formulario se recalculan comparaciones, sin subir el PDF otra vez.
export async function revisarDocumento(api, archivo, contexto, anterior, forzar = false) {
    if (!forzar && anterior?.archivo === archivo && anterior.id) {
        try {
            return await api.post('/documentos/revisar-ia', { ...contexto, revision_anterior: anterior.id });
        } catch (error) {
            // Solo una lectura caducada justifica volver a enviar el archivo.
            if (error.status !== 410) throw error;
        }
    }
    const fd = new FormData();
    fd.append('archivo', archivo);
    for (const [key, value] of Object.entries(contexto)) {
        if (value !== undefined && value !== null && value !== '') fd.append(key, String(value));
    }
    if (forzar) fd.append('forzar_revision', '1');
    return api.upload('/documentos/revisar-ia', fd);
}
