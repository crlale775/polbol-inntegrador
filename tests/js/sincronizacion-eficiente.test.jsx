import React from 'react';
import { act, cleanup, render, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({get:vi.fn()}));
vi.mock('../../resources/js/lib/api',()=>({default:mocks}));
vi.mock('../../resources/js/context/AuthContext',()=>({useAuth:()=>({user:{id_usuario:1,id_rol:3,rol:'Comando General'},verificando:false})}));
import useSincronizacion from '../../resources/js/lib/useSincronizacion';
import { SyncProvider, ToastProvider, useSyncGlobal } from '../../resources/js/components/ui/ToastEnVivo';

const summary=[{id_epi:1,total:10,en_revision:2,observados:1,aprobados:7}];
const response=(extra={})=>({servidor_hora:'2026-11-09T12:00:00-04:00',documentos:[],solicitudes:[],resumen_epi:structuredClone(summary),...extra});
const flush=async()=>{await act(async()=>{await Promise.resolve();await Promise.resolve();});};
beforeEach(()=>{vi.useFakeTimers();mocks.get.mockResolvedValue(response());});
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();});

describe('Sincronización sin repintados innecesarios',()=>{
    it('los sondeos sin cambios conservan la referencia del resumen',async()=>{
        const {result}=renderHook(()=>useSincronizacion());await flush();
        const initial=result.current.resumenEpi;
        await act(async()=>vi.advanceTimersByTime(5000));
        expect(mocks.get).toHaveBeenCalledTimes(2);
        expect(result.current.resumenEpi).toBe(initial);
        mocks.get.mockResolvedValue(response({resumen_epi:[{...summary[0],total:11}]}));
        await act(async()=>vi.advanceTimersByTime(5000));
        expect(result.current.resumenEpi).not.toBe(initial);
        expect(result.current.resumenEpi[0].total).toBe(11);
    });

    it('un delta vacío conserva los estados para reconocer cambios posteriores',async()=>{
        const onDocumento=vi.fn(),onSolicitud=vi.fn();
        mocks.get.mockResolvedValueOnce(response({documentos:[{id_documento:5,estado_actual:2,id_epi:1}],solicitudes:[{id_solicitud:8,estado_solicitud:'pendiente',ia_estado:'pendiente'}]}));
        renderHook(()=>useSincronizacion({onDocumento,onSolicitud}));await flush();
        await act(async()=>vi.advanceTimersByTime(5000));
        mocks.get.mockResolvedValue(response({documentos:[{id_documento:5,estado_actual:3,id_epi:1}],solicitudes:[{id_solicitud:8,estado_solicitud:'pendiente',ia_estado:'verificado'}]}));
        await act(async()=>vi.advanceTimersByTime(5000));
        expect(onDocumento).toHaveBeenCalledWith([expect.objectContaining({tipo:'estado',antes:2,estado_actual:3})]);
        expect(onSolicitud).toHaveBeenCalledWith([expect.objectContaining({tipo:'actualizada',id_solicitud:8})]);
    });

    it('los paneles no se renderizan otra vez solo por actualizar la hora del sondeo',async()=>{
        let renders=0;
        function Panel(){const state=useSyncGlobal();renders++;return <output>{state.conectado?'conectado':'esperando'}</output>;}
        render(<ToastProvider><SyncProvider><Panel /></SyncProvider></ToastProvider>);await flush();
        const baseline=renders;
        await act(async()=>vi.advanceTimersByTime(10000));
        expect(renders).toBe(baseline);
    });

    it('no hace peticiones con la pestaña oculta',async()=>{
        vi.spyOn(document,'hidden','get').mockReturnValue(true);
        renderHook(()=>useSincronizacion());await flush();
        await act(async()=>vi.advanceTimersByTime(10000));
        expect(mocks.get).not.toHaveBeenCalled();
    });
});
