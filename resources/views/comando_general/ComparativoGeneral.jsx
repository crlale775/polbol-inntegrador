import React from 'react';
import LayoutComandoGeneral from '../../js/components/LayoutComandoGeneral';
import DesempenioEpisPanel from '../../js/components/analytics/DesempenioEpisPanel';

export default function ComparativoGeneral() {
    return <DesempenioEpisPanel Layout={LayoutComandoGeneral} titulo="Desempeño y efectividad por EPI" ordenInicial="aprobacion" />;
}
