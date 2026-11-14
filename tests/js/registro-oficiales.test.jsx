import React from 'react';
import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
const mocks=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),upload:vi.fn()}));
vi.mock('../../resources/js/lib/api',()=>({default:{...mocks,solicitudArchivoUrl:(id,tipo)=>`/archivo/${id}/${tipo}`}}));
vi.mock('../../resources/js/context/AuthContext',()=>({useAuth:()=>({user:{id_usuario:3,id_rol:3}})}));
vi.mock('../../resources/js/components/LayoutComandoGeneral',()=>({default:({children})=><main>{children}</main>}));
vi.mock('../../resources/js/components/ui/ToastEnVivo',()=>({useSyncGlobal:()=>({conectado:true}),ChipEnVivo:()=> <span>En vivo</span>}));
import Registro from '../../resources/views/comando_general/RegistroOficialesIA';
const fila={id_solicitud:9,nombres:'Persona',apellidos:'Prueba',usuario:'qa_prueba',estado_solicitud:'recibida',ia_estado:'error',adjuntos:{memo:false,foto:false},ruta_memo:'solicitudes/ausente.pdf',ruta_foto:'solicitudes/fotos/ausente.png'};
beforeEach(()=>{
    vi.clearAllMocks();mocks.get.mockImplementation(async path=>path.startsWith('/solicitudes-registro?')?{data:[fila],meta:{pagina:1,ultima_pagina:60,total:1200},estadisticas:{recibidas:383,aprobadas:418,advertencias:202}}
        :path==='/solicitudes-registro/9'?fila:path.startsWith('/registro-links?')?{data:[],meta:{pagina:1,ultima_pagina:1,total:0},estadisticas:{activos:1200}}:[]);
});
afterEach(cleanup);
const abrir=async()=>{render(<MemoryRouter><Registro/></MemoryRouter>);await screen.findByText('Persona Prueba');};
describe('Registro de oficiales: carga acotada y recuperación',()=>{
    it('pide una página pequeña y conserva los indicadores globales',async()=>{
        await abrir();expect(mocks.get).toHaveBeenCalledWith('/solicitudes-registro?paginar=1&por_pagina=20&page=1');
        expect(screen.getByText('383')).toBeTruthy();expect(screen.getByText('418')).toBeTruthy();
        fireEvent.click(screen.getByRole('button',{name:'Siguiente: Solicitudes'}));
        await waitFor(()=>expect(mocks.get).toHaveBeenCalledWith('/solicitudes-registro?paginar=1&por_pagina=20&page=2'));
    });
    it('no carga fotos inexistentes ni ofrece verificar un PDF ausente',async()=>{
        await abrir();expect(screen.queryByRole('img')).toBeNull();expect(screen.getByRole('button',{name:'Falta PDF'}).disabled).toBe(true);
        fireEvent.click(screen.getByRole('button',{name:'Ver',exact:true}));
        expect(await screen.findByText(/falta el archivo original/)).toBeTruthy();
        expect(screen.getByRole('button',{name:'Adjunte el PDF para verificar'}).disabled).toBe(true);
        expect(screen.getByLabelText(/Memorándum PDF/)).toBeTruthy();
    });
    it('filtrar observaciones vuelve a la primera página',async()=>{
        await abrir();fireEvent.change(screen.getByRole('combobox',{name:'Estado'}),{target:{value:'advertencia'}});
        await waitFor(()=>expect(mocks.get).toHaveBeenCalledWith('/solicitudes-registro?paginar=1&por_pagina=20&page=1&con_advertencia=1'));
    });
    it('un refresco en vivo no vuelve a descargar los catálogos',async()=>{
        await abrir();const roles=mocks.get.mock.calls.filter(([path])=>path==='/roles').length;
        window.dispatchEvent(new Event('ofbol:sync'));
        await waitFor(()=>expect(mocks.get.mock.calls.filter(([path])=>path.startsWith('/solicitudes-registro?')).length).toBe(2));
        expect(mocks.get.mock.calls.filter(([path])=>path==='/roles').length).toBe(roles);
    });
});
