import React from 'react';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import api from '../../resources/js/lib/api';
import EstadoCarga from '../../resources/js/components/ui/EstadoCarga';

let xhr;
class Solicitud {
    upload = {};
    headers = {};
    constructor() { xhr = this; }
    open = vi.fn();
    send = vi.fn();
    setRequestHeader(key, value) { this.headers[key] = value; }
    responder(status, body) { this.status = status; this.responseText = JSON.stringify(body); this.onload(); }
}
const archivo = () => { const fd = new FormData(); fd.append('archivo', new File(['%PDF-1.4'], 'prueba.pdf', { type: 'application/pdf' })); return fd; };
beforeEach(() => { vi.stubGlobal('XMLHttpRequest', Solicitud); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Carga de archivos · confirmación y recuperación', () => {
    it('100% transferido no es confirmación de guardado', async () => {
        render(<EstadoCarga />);
        let carga;
        act(() => { carga = api.upload('/upload-documento', archivo()); });
        act(() => xhr.upload.onprogress({ lengthComputable: true, loaded: 100, total: 100 }));
        expect(screen.getByText('Confirmando recepción')).toBeTruthy();
        expect(screen.queryByText('Proceso terminado')).not.toBeTruthy();
        await act(async () => { xhr.responder(201, { ruta: 'documentos/uuid.pdf' }); await carga; });
        expect(screen.getByText('Proceso terminado')).toBeTruthy();
    });
    it('no acepta un 200 sin ruta del PDF', async () => {
        const carga = api.upload('/upload-documento', archivo());
        const resultado = expect(carga).rejects.toThrow('no confirmó dónde');
        xhr.responder(200, {}); await resultado;
    });
    it('un error de validación conserva el detalle y el estado', async () => {
        const carga = api.upload('/upload-documento', archivo());
        const resultado = expect(carga).rejects.toMatchObject({ status: 422, errors: { archivo: ['PDF inválido'] } });
        xhr.responder(422, { message: 'PDF inválido', errors: { archivo: ['PDF inválido'] } }); await resultado;
    });
    it('un timeout termina la espera sin declarar éxito', async () => {
        const carga = api.upload('/upload-documento', archivo());
        expect(xhr.timeout).toBe(0);
        const resultado = expect(carga).rejects.toThrow('no confirmó la carga');
        xhr.ontimeout(); await resultado;
    });
    it('una desconexión permite informar el fallo', async () => {
        const carga = api.upload('/upload-documento', archivo());
        const resultado = expect(carga).rejects.toThrow('Se interrumpió');
        xhr.onerror(); await resultado;
    });
    it('la IA no disponible no se presenta como revisión exitosa', async () => {
        render(<EstadoCarga />); let carga;
        act(() => { carga = api.upload('/documentos/revisar-ia', archivo()); });
        expect(xhr.timeout).toBe(0);
        await act(async () => { xhr.responder(200, { ia_disponible: false, mensaje: 'Motor no disponible' }); await carga; });
        expect(screen.getByText('No se pudo completar')).toBeTruthy();
        expect(screen.getByText('Motor no disponible')).toBeTruthy();
    });
    it('distingue rechazo del servidor por tamaño', async () => {
        const carga = api.upload('/upload-documento', archivo());
        const resultado = expect(carga).rejects.toThrow('supera el límite');
        xhr.responder(413, null); await resultado;
    });
});
