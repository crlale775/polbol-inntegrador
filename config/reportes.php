<?php

return [
    // El rol departamental de esta instalación pertenece a La Paz.
    'comando_departamental_id' => (int) env('REPORTES_COMANDO_DEPARTAMENTAL_ID', 1),
    'python' => env('REPORTES_PYTHON', 'python'),
    'max_documentos' => 50000,
];
