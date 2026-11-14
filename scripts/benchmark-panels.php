<?php

require __DIR__ . '/../vendor/autoload.php';
$app = require __DIR__ . '/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Http\Controllers\PanelController;
use App\Models\Usuario;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

// The DB transaction rejects every write. No login, seed or migration runs here.
$report = [];
try {
    DB::beginTransaction();
    DB::statement('SET TRANSACTION READ ONLY');
    DB::enableQueryLog();
    foreach (['unidad' => 1, 'departamental' => 2, 'general' => 3] as $method => $role) {
        $actor = Usuario::where('id_rol', $role)->where('estado', true)->first();
        if (!$actor) { $report[$method] = ['skipped' => 'No active account for role']; continue; }
        $request = Request::create('/api/panel/' . $method, 'GET');
        $request->setUserResolver(fn () => $actor);
        $samples = [];
        for ($round = 0; $round < 5; $round++) {
            DB::flushQueryLog();
            $start = hrtime(true);
            $response = $app->make(PanelController::class)->$method($request);
            $elapsed = round((hrtime(true) - $start) / 1e6, 2);
            $queries = count(DB::getQueryLog());
            $payload = json_decode($response->getContent(), true, 512, JSON_THROW_ON_ERROR);
            $total = (int) $payload['resumen']['total'];
            if (array_sum(array_column($payload['por_estado'], 'total')) !== $total) {
                throw new LogicException('Panel state totals do not agree.');
            }
            foreach (['por_epi', 'por_tipo'] as $distribution) {
                if (isset($payload[$distribution]) && array_sum(array_column($payload[$distribution], 'total')) !== $total) {
                    throw new LogicException('Panel distribution does not agree.');
                }
            }
            if ($method === 'unidad') foreach ($payload['actividad'] as $document) {
                if ((int) $document['id_epi'] !== (int) $actor->id_epi) throw new LogicException('EPI scope mismatch.');
            }
            $samples[] = [
                'ms' => $elapsed,
                'queries' => $queries,
                'responseBytes' => strlen($response->getContent()),
            ];
        }
        $report[$method] = $samples;
    }
    DB::rollBack();
    $json = json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n";
    if (isset($argv[1])) file_put_contents($argv[1], $json);
    echo $json;
} catch (Throwable $error) {
    if (DB::transactionLevel() > 0) DB::rollBack();
    fwrite(STDERR, "Benchmark unavailable: " . get_class($error) . ". No data was changed.\n");
    exit(1);
}
