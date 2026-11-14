import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const actor={id_usuario:1,id_rol:1,id_epi:1,epi:'EPI de prueba',usuario:'prueba'};
const mocks=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),upload:vi.fn()}));
vi.mock('../../resources/js/lib/api',()=>({default:mocks}));
vi.mock('../../resources/js/context/AuthContext',()=>({useAuth:()=>({user:actor})}));
vi.mock('../../resources/js/components/LayoutSecretario',()=>({default:({children})=><main>{children}</main>}));
vi.mock('../../resources/js/components/ui/ToastEnVivo',()=>({useToast:()=>vi.fn()}));
import SubirDocumento from '../../resources/views/secretario_unidad/SubirDocumento';

beforeEach(()=>{
    mocks.get.mockImplementation(async path=>path.startsWith('/tipos-documento')?[
        {id_tipo:1,nombre:'Designación',activo:true,acceso_directo:true},
        {id_tipo:2,nombre:'Permiso',activo:true,acceso_directo:true},
        {id_tipo:3,nombre:'Otro',activo:true},
        {id_tipo:4,nombre:'Inactivo',activo:false},
    ]:path.startsWith('/oficiales')?[{id_oficial:10,id_epi:1,nombres:'Oficial',apellidos:'Prueba',ci:'12345',grado:{nombre:'Capitán',abreviatura:'Cap.'}}]:[]);
    mocks.upload.mockImplementation(async path=>path==='/upload-documento'?{ruta:'documentos/prueba.pdf',hash:'servidor'}:{ia_disponible:true,descartado:true,es_memo:false,motivo_descarte:'No se reconoce el encabezado.',tipo_esperado:'Memo Plus',revision_id:'revision-de-prueba'});
    mocks.post.mockResolvedValue({token_confirmacion:'token-de-prueba',vence_en:90,observaciones:['No se reconoce el encabezado.']});
});
afterEach(()=>{cleanup();vi.restoreAllMocks();});

async function preparar(){
    const view=render(<MemoryRouter><SubirDocumento /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button',{name:/Cap\. Capitán Oficial Prueba/}));
    fireEvent.click(screen.getByRole('button',{name:'Otros (especificar tipo)'}));
    fireEvent.change(screen.getByPlaceholderText('Ej: Memorándum de Reconocimiento Especial…'),{target:{value:'Memo Plus'}});
    fireEvent.change(screen.getByPlaceholderText('Ej: Ref. Notificación de Memorándum de Felicitación por Servicio Distinguido'),{target:{value:'Referencia de prueba sin validez institucional'}});
    const file=new File(['%PDF-1.4\nMEMORANDUM\n%%EOF'],'prueba.pdf',{type:'application/pdf'});
    file.arrayBuffer=async()=>new ArrayBuffer(8);
    fireEvent.change(view.container.querySelector('input[type="file"]'),{target:{files:[file]}});
    await waitFor(()=>expect(mocks.upload).toHaveBeenCalledWith('/documentos/revisar-ia',expect.any(FormData)));
    await waitFor(()=>expect(screen.getByRole('button',{name:'Registrar y Remitir al Comando Dptal.'}).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button',{name:'Registrar y Remitir al Comando Dptal.'}));
    return screen.findByRole('dialog',{name:'Confirmar remisión del documento'});
}

describe('Remisión con confirmación explícita',()=>{
    it('conserva Otros, prepara en servidor y no envía al abrir el resumen',async()=>{
        const dialog=await preparar();
        expect(mocks.post).toHaveBeenCalledWith('/documentos/preparar-envio',expect.objectContaining({id_oficial:10,id_tipo:3,tipo_libre:'Memo Plus',revision_id:'revision-de-prueba'}));
        expect(mocks.post.mock.calls.some(([path])=>path==='/documentos')).toBe(false);
        expect(within(dialog).getByText('No se reconoce el encabezado.',{exact:false})).toBeTruthy();
        const send=within(dialog).getByRole('button',{name:'Confirmar y remitir'});
        expect(send.disabled).toBe(true);
        fireEvent.click(within(dialog).getByRole('checkbox'));
        expect(send.disabled).toBe(false);
        fireEvent.click(within(dialog).getByRole('button',{name:'Cancelar'}));
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(mocks.post.mock.calls.some(([path])=>path==='/documentos')).toBe(false);
    });

    it('al vencer desmarca la aceptación e impide remitir hasta renovar',async()=>{
        const dialog=await preparar();
        const ack=within(dialog).getByRole('checkbox');fireEvent.click(ack);
        vi.spyOn(performance,'now').mockReturnValue(performance.now()+91000);
        await within(dialog).findByRole('button',{name:'Generar nueva confirmación'});
        expect(ack.checked).toBe(false);
        expect(ack.disabled).toBe(true);
        expect(within(dialog).getByRole('button',{name:'Confirmar y remitir'}).disabled).toBe(true);
    });

    it('muestra tipos del catálogo y oculta los inactivos',async()=>{
        render(<MemoryRouter><SubirDocumento /></MemoryRouter>);
        expect(await screen.findByRole('button',{name:'Permiso',exact:true})).toBeTruthy();
        expect(screen.queryByRole('button',{name:'Inactivo',exact:true})).toBeNull();
        expect(screen.getByRole('combobox',{name:'Todos los tipos de memorándum'})).toBeTruthy();
    });
});
