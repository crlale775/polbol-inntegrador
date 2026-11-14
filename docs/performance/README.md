# OFBOL · Cambios visuales y rendimiento

Aplicados en C:/laragon/www/ofbol con UI UX Pro Max instalada en .agents/skills/ui-ux-pro-max.

## Interfaz

- Navegación institucional compartida y persistente para los tres roles; grupos consistentes de operación, análisis, administración y cuenta.
- Sidebar contraíble con preferencia por sesión y drawer móvil con Escape y retorno de foco.
- Cabecera con módulo actual, búsqueda bajo demanda, notificaciones y menú de perfil.
- Superficies, tablas, indicadores, formularios y login con jerarquía y contraste comunes.
- Fotos autorizadas y emblema oficial transparente; sin cambiar los controles de acceso.
- Skeleton dentro del área de trabajo, conservando el menú mientras llega el código de una pantalla.

## Recursos iniciales

Dependencias estáticas de las entradas de Vite. No incluye imágenes ni módulos diferidos de cada ruta.
Gzip es tamaño calculado, no una comprobación de la compresión configurada en el servidor.

| Métrica | Antes | Después | Reducción |
|---|---:|---:|---:|
| CSS + JS iniciales | 760900 bytes | 460641 bytes | 39.5% |
| CSS + JS gzip | 217158 bytes | 123821 bytes | 43.0% |
| Emblema usado a tamaño pequeño | 2239752 bytes PNG | 14964 bytes WebP | 99.3% |

El buscador y su diálogo se descargan al abrirlos. Las transiciones sencillas usan CSS, sin cargar un runtime de animación.
Las rutas se precargan por intención y, en reposo, de una en una. Se respetan redes 2G, ahorro de datos y pestañas ocultas.
Las solicitudes GET concurrentes se deduplican. Solo los catálogos tienen caché en memoria hasta 60 s; las notificaciones 10 s.
Documentos y paneles vuelven a pedir datos. Escrituras, cargas, login, logout y sesión vencida invalidan la caché.

## Paneles sobre PostgreSQL

Cinco muestras por controlador en una transacción de SOLO LECTURA; mediana en milisegundos.
No son tiempos de página completa: excluyen arranque HTTP, autenticación, red, descarga y pintura del navegador.
Las muestras no se tomaron simultáneamente y varían con la carga del equipo; no atribuir toda diferencia temporal al cambio.
La reducción de consultas de General proviene de reemplazar un COUNT por tipo por una agregación agrupada.

| Panel | Consultas antes → después | Mediana antes (ms) | Mediana después (ms) |
|---|---:|---:|---:|
| unidad | 9 → 9 | 13.55 | 12.20 |
| departamental | 12 → 12 | 16.54 | 20.87 |
| general | 19 → 13 | 21.79 | 17.10 |

Se comprobó coherencia entre el total y las distribuciones por estado/tipo/EPI y el ámbito EPI de la actividad.
Los tres tamaños de respuesta se conservaron en estas muestras. El contador de hoy de una unidad se limita a su EPI.
No se ejecutaron seeds, migraciones ni escrituras en PostgreSQL.

## Verificación y límites

- Build de producción correcto.
- Batería JS: 117 pruebas en 8 archivos aprobadas. Pruebas de caché repetidas tras evitar copias de listas grandes: 4/4.
- Sintaxis PHP y benchmark de los paneles correctos.
- La revisión visual real en Edge se detuvo: Computer Use no pudo identificar con certeza la URL de Windows.
- No se midieron LCP, INP ni el tiempo completo de cada pantalla. No se atribuye una cifra universal de carga al sistema.
- La batería PHPUnit permanece sin validar por el bloqueo de bootstrap informado anteriormente.

## Reproducir

- node scripts/measure-bundle.mjs docs/performance/bundle-after.json (después de npm run build).
- php scripts/benchmark-panels.php docs/performance/panels-after.json (PostgreSQL, solo lectura).
- node scripts/report-performance.mjs.
- npm test -- --reporter=dot --pool=forks --maxWorkers=1.

Si Windows falla con rutas temporales de workers, usar TEMP y TMP dentro de una carpeta temporal del proyecto, como en esta sesión.
