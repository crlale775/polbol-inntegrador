import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../resources/js/lib/sounds',()=>({default:{error:vi.fn(),advertencia:vi.fn()}}));
const response=(status,data={})=>({status,ok:status<400,json:async()=>data});
beforeEach(()=>{vi.useFakeTimers();vi.resetModules();localStorage.clear();sessionStorage.clear();});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks();window.history.replaceState({},'','/');});

describe('Respuestas de sesiones anteriores',()=>{
    it('descarta JSON cuyo cuerpo termina después del nuevo login',async()=>{
        let body;
        vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce({ok:true,status:200,json:()=>new Promise(resolve=>{body=resolve;})}).mockResolvedValue(response(200,{id_usuario:2})));
        const {default:api}=await import('../../resources/js/lib/api');
        const pending=api.get('/me').catch(error=>error);
        for(let i=0;i<8;i++)await Promise.resolve();
        expect(body).toBeTypeOf('function');
        await api.post('/login',{usuario:'prueba'});
        body({id_usuario:1});
        expect(await pending).toMatchObject({sesionAnterior:true});
    });

    it('no entrega el archivo descargado si cambia la cuenta durante el cuerpo',async()=>{
        let body;
        vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce({ok:true,status:200,headers:{get:()=>''},blob:()=>new Promise(resolve=>{body=resolve;})}).mockResolvedValue(response(200)));
        const {default:api}=await import('../../resources/js/lib/api');
        const pending=api.download('/plantillas/1/archivo').catch(error=>error);
        for(let i=0;i<8;i++)await Promise.resolve();
        expect(body).toBeTypeOf('function');
        await api.post('/logout');body(new Blob(['fixture']));
        expect(await pending).toMatchObject({sesionAnterior:true});
    });
    it('un 401 anterior al cierre no declara otra expiración',async()=>{
        let finish;
        vi.stubGlobal('fetch',vi.fn().mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;})).mockResolvedValue(response(200)));
        const {default:api}=await import('../../resources/js/lib/api');
        const events=vi.spyOn(window,'dispatchEvent');
        const pending=api.get('/sync/estado').catch(error=>error);
        await Promise.resolve();await Promise.resolve();
        await api.post('/logout');finish(response(401));
        const error=await pending;
        expect(error.sesionAnterior).toBe(true);
        expect(events.mock.calls.some(([event])=>event.type==='ofbol:sesion-expirada')).toBe(false);
    });

    it('un fallo tardío no borra la cuenta que acaba de ingresar',async()=>{
        let finish;
        vi.stubGlobal('fetch',vi.fn().mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;})).mockResolvedValue(response(200,{id_usuario:2})));
        const {default:api}=await import('../../resources/js/lib/api');
        const pending=api.get('/me').catch(error=>error);
        await Promise.resolve();await Promise.resolve();
        await api.post('/login',{usuario:'prueba'});
        sessionStorage.setItem('ofbol_user','sesion-nueva');
        finish(response(401));await pending;
        expect(sessionStorage.getItem('ofbol_user')).toBe('sesion-nueva');
    });

    it('una expiración vigente conserva el aviso y limpia la sesión',async()=>{
        vi.stubGlobal('fetch',vi.fn().mockResolvedValue(response(401)));
        const {default:api}=await import('../../resources/js/lib/api');
        sessionStorage.setItem('ofbol_user','sesion-anterior');
        const events=vi.spyOn(window,'dispatchEvent');
        await expect(api.get('/documentos')).rejects.toMatchObject({status:401,sesionAnterior:false});
        expect(sessionStorage.getItem('ofbol_user')).toBeNull();
        expect(events.mock.calls.some(([event])=>event.type==='ofbol:sesion-expirada')).toBe(true);
    });
});
