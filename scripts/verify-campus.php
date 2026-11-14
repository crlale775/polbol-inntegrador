<?php

require __DIR__ . '/../vendor/autoload.php';
$app = require __DIR__ . '/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Http\Controllers\DocumentoController;
use App\Http\Controllers\PanelController;
use App\Models\Documento;
use App\Models\Epi;
use Illuminate\Support\Facades\DB;

// Exercise the real response contract without login, seeds or database writes.
try {
    DB::beginTransaction();
    DB::statement('SET TRANSACTION READ ONLY');
    $performance = $app->make(DocumentoController::class)->desempenioEpis()->getData(true);
    if (!isset($performance['epis'], $performance['resumen_global'])) throw new LogicException('Missing consolidated response.');
    if (count($performance['epis']) !== Epi::count()) throw new LogicException('Missing stations.');
    if (array_sum(array_column(array_column($performance['epis'], 'metricas'), 'total_documentos')) !== Documento::count()) {
        throw new LogicException('Document totals do not agree.');
    }
    $byId = array_column($performance['epis'], null, 'id_epi');
    foreach (['general', 'departamental'] as $role) {
        $panel = $app->make(PanelController::class)->$role()->getData(true);
        if (count($panel['por_epi']) !== count($byId)) throw new LogicException('Dashboard stations do not agree.');
        foreach ($panel['por_epi'] as $station) {
            $metrics = $byId[$station['id_epi']]['metricas'];
            foreach (['en_revision', 'aprobados', 'observados', 'registrados'] as $key) {
                if ((int) $station[$key] !== (int) $metrics[$key]) throw new LogicException('Station status mismatch.');
            }
            if ((int) $station['total'] !== (int) $metrics['total_documentos']) throw new LogicException('Station volume mismatch.');
        }
    }
    $report = [
        'stations' => count($byId),
        'documents' => $performance['resumen_global']['total'],
        'contract' => 'consolidated object verified',
        'dashboardStatusConsistency' => true,
        'readOnly' => true,
    ];
    DB::rollBack();
    $json = json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n";
    if (isset($argv[1])) file_put_contents($argv[1], $json);
    echo $json;
} catch (Throwable $error) {
    if (DB::transactionLevel() > 0) DB::rollBack();
    fwrite(STDERR, 'Campus check failed: ' . get_class($error) . ". No database data was changed.\n");
    exit(1);
}
