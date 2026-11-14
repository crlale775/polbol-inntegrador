import {describe,expect,it,vi} from 'vitest';
import {revisarDocumento} from '../../resources/js/lib/revisionDocumento';

const pdf=()=>new File(['%PDF-1.4'], 'memo.pdf', {type:'application/pdf'});
const cliente=()=>({upload:vi.fn().mockResolvedValue({revision_id:'nueva'}),post:vi.fn().mockResolvedValue({revision_id:'comparada'})});

describe('Revisión de un archivo sin transferencias duplicadas',()=>{
    it('usa la referencia del mismo archivo con los datos actuales',async()=>{
        const api=cliente(),archivo=pdf();
        await revisarDocumento(api,archivo,{tipo_esperado:'Vacación',id_oficial:9},{archivo,id:'lectura'});
        expect(api.upload).not.toHaveBeenCalled();
        expect(api.post).toHaveBeenCalledWith('/documentos/revisar-ia',{tipo_esperado:'Vacación',id_oficial:9,revision_anterior:'lectura'});
    });
    it('una lectura vencida vuelve a enviar el archivo una vez',async()=>{
        const api=cliente(),archivo=pdf();api.post.mockRejectedValue({status:410});
        await revisarDocumento(api,archivo,{id_tipo:2},{archivo,id:'caducada'});
        expect(api.upload).toHaveBeenCalledTimes(1);
        expect(api.upload.mock.calls[0][1].get('archivo')).toBe(archivo);
    });
    it('una referencia de otra cuenta no dispara una carga adicional',async()=>{
        const api=cliente(),archivo=pdf();api.post.mockRejectedValue({status:403});
        await expect(revisarDocumento(api,archivo,{}, {archivo,id:'ajena'})).rejects.toMatchObject({status:403});
        expect(api.upload).not.toHaveBeenCalled();
    });
    it('reintentar fuerza una lectura nueva y otro archivo no usa la referencia anterior',async()=>{
        const api=cliente(),archivo=pdf(),anterior={archivo,id:'lectura'};
        await revisarDocumento(api,archivo,{},anterior,true);
        expect(api.upload.mock.calls[0][1].get('forzar_revision')).toBe('1');
        await revisarDocumento(api,pdf(),{},anterior);
        expect(api.post).not.toHaveBeenCalled();expect(api.upload).toHaveBeenCalledTimes(2);
    });
});
