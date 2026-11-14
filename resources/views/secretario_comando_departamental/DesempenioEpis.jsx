import React from 'react';
import LayoutComandoDepartamental from '../../js/components/LayoutComandoDepartamental';
import DesempenioEpisPanel from '../../js/components/analytics/DesempenioEpisPanel';

export default function DesempenioEpis() {
    return <DesempenioEpisPanel Layout={LayoutComandoDepartamental} titulo="Desempeño por EPI" />;
}
