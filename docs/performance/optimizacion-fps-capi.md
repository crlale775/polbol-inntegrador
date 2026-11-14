# Optimización de fluidez y acceso

Verificación local del 9 de noviembre de 2026, navegador a 1440 × 1000, DPR 1. Las cifras corresponden a este entorno, no a una garantía para cualquier dispositivo.

| Medición | Antes | Después |
|---|---:|---:|
| Escena 3D, cuadros renderizados por segundo | 30 | 59,9 |
| Llamadas de dibujo por cuadro | 281 | 129 |
| Triángulos de la escena | 26.326 | 26.326 |
| CPU media de actualización y envío del cuadro | 3,74 ms | 2,65 ms |
| Imagen habitual de Capi | 403.308 bytes animados | 5.676 bytes estáticos |
| Motor 3D, tamaño gzip de compilación | 198,05 KB | 146,22 KB |

La muestra de cinco segundos del panel General registró 59,5 fps del bucle del navegador, con cero intervalos superiores a 34 ms y cero tareas largas durante la muestra. Este panel usa SVG y CSS; no descarga Three.js. La medida no equivale a una prueba de carga con usuarios concurrentes.

## Cambios

- Se elimina el límite fijo de 33 ms por fotograma. La frecuencia sigue `requestAnimationFrame`; un monitor/navegador de 60 Hz permite aproximadamente 60 fps. Se ajusta la resolución de la escena si el equipo necesita reducir carga.
- Se agrupan las superficies estáticas por material, conservando posiciones, texturas y geometría. Los elementos animados se mantienen separados.
- Las trayectorias se calculan una vez y se interpolan. Las animaciones usan tiempo transcurrido, para conservar su velocidad en pantallas de mayor refresco.
- Importaciones explícitas permiten excluir partes no utilizadas de Three.js. Su descarga queda restringida a la portada.
- Capi habitual usa una imagen estática optimizada. Las variantes animadas se descargan al abrir la guía. Se eliminan los controles manuales de pausa/silencio; se respeta automáticamente el movimiento reducido del sistema.
- Los contadores actualizan su texto sin commits de React por fotograma. Los sondeos de sincronización conservan el resumen cuando no cambió y no provocan repintados del conjunto de paneles. Se conservan los estados anteriores entre deltas vacíos.
- Se elimina el desenfoque continuo de las tarjetas superpuestas a la escena. Las interacciones conservan transiciones breves de opacidad/transformación.
- Configuración, rutas y vistas de Laravel compiladas en caché.
- Un error de autenticación tardío, anterior a otro inicio/cierre de sesión, no borra la nueva sesión. La redirección por expiración solo se aplica a rutas privadas y conserva la portada pública.
- Los consejos de Capi no se superponen mientras se escriben credenciales o se completan campos del formulario.

## Arranque PHP optimizado

Se dejó el mismo proyecto disponible en `http://127.0.0.1:8001/`, con la extensión OPcache ya instalada en Laragon. El servidor anterior del puerto 8000 conserva sus cambios visuales. No se modificó el `php.ini` global.

Mediana de cinco solicitudes secuenciales al HTML público, excluyendo una petición inicial de calentamiento: **515,57 ms en 8000 y 184,55 ms en 8001**. Son tiempos del HTML, no del render completo ni de la IA. La primera petición del servidor necesita llenar la caché y puede tardar más.

Para volver a iniciarlo desde PowerShell, desde la raíz del proyecto:

```powershell
.\scripts\iniciar-servidor.ps1
```

Permite `-Port` y `-Php` para otra instalación. Se enlaza solo a `127.0.0.1`, comprueba que el puerto esté libre y valida cambios de archivos PHP en cada solicitud. Para cambiar `.env` o configuración después de compilarla, ejecutar `php artisan optimize:clear` y volver a compilar con `php artisan optimize`.

## Reproducir las verificaciones

- `npm run build`.
- `npm test -- --pool=forks --maxWorkers=1`: regresión completa aprobada, 150 pruebas en 14 archivos. Tras el ajuste final para no interrumpir la escritura se aprobaron las ocho pruebas específicas de Capi, incluida la nueva comprobación de foco.
- `php scripts/verificar-remision.php`: 22 comprobaciones con rollback, conservando los expedientes reales.
- `node scripts/benchmark-http.mjs`: comparación local entre los dos arranques.
- Abrir la ruta con `?rendimiento=1` y dejarla visible unos ocho segundos. El diagnóstico optativo deja las medidas en el atributo `data-rendimiento` de `#root` y del canvas; no transmite información ni se ejecuta en el uso habitual.

Documentación oficial de la configuración utilizada: [OPcache, PHP](https://www.php.net/manual/en/opcache.configuration.php).
