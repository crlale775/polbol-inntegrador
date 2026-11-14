import { describe, expect, it } from 'vitest';
import { celdaCsv, contenidoCsv } from '../../resources/js/lib/csvSeguro';

describe('CSV institucional frente a entradas de menor confianza', () => {
    it('mantiene las fórmulas como texto, incluso tras espacios y controles', () => {
        for (const entrada of ['=1+1', '+1', '-1', '@SUM(A1)', '  =1+1', '\t=1+1', '\r=1+1', '\n=1+1', '\uFEFF=1+1'])
            expect(celdaCsv(entrada)).toBe(`"'${entrada}"`);
    });
    it('conserva comillas, separadores, líneas, Unicode y # dentro de una celda', () => {
        expect(contenidoCsv([['Referencia', 'Nombre'], ['Memo "A"; #2\nAnexo', 'Policía Boliviana']]))
            .toBe('\uFEFF"Referencia";"Nombre"\r\n"Memo ""A""; #2\nAnexo";"Policía Boliviana"');
    });
});
