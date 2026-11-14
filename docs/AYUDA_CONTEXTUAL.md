# Ayuda guiada institucional

Se integra Driver.js 1.11 mediante npm. Sus recursos y estilos se sirven desde la aplicación; no utiliza CDN ni servicios externos de ayuda.

## Uso

El botón circular de **Capi**, con «¿Te ayudo?» encima, inicia directamente el recorrido de la pantalla. El contenido cambia según la ruta y el rol. La cobertura comprende las 35 pantallas de Secretaría EPI, Comando Departamental y Comando General, la portada, el acceso y el registro por enlace. Los alias existentes conservan la guía del módulo original.

Cuando hay un detalle o formulario abierto, la ayuda explica sus campos visibles, el PDF y sus botones de decisión.

Los recorridos se inician a petición del usuario. Ofrecen Anterior, Siguiente, Finalizar, salida con la cruz y Escape. Se pueden repetir. Un recorrido completo queda señalado como completado en la sesión del navegador; cerrar uno antes de terminar no lo marca como completo. Cambiar de ruta destruye el recorrido y sus escuchas.

Los botones del recorrido no invocan acciones del expediente ni envían formularios. Los textos procedentes de etiquetas o títulos del detalle se escapan antes de incorporarse al popover.

## Personajes y rendimiento

Se conservan los dos GIF originales suministrados, con transparencia. Capi habitual utiliza un fotograma WebP de menos de 6 KB. Las variantes animadas acompañan el recorrido al solicitarlo; el movimiento reducido del sistema y la visibilidad de la página se atienden automáticamente. No se muestran controles manuales de pausa o silencio.

El catálogo y Driver.js se descargan al pedir ayuda. Las variantes animadas no forman parte de la carga inicial del acceso o de las pantallas operativas. El lanzador reserva espacio al final del área de trabajo y los avisos de carga se sitúan encima para evitar solapamientos.

## Mantenimiento

- `resources/js/lib/guias.js`: catálogo de contenido por ruta, ayuda de navegación y explicación del detalle abierto.
- `resources/js/components/ayuda/`: lanzador, panel, preferencias y ciclo de vida de Driver.js.
- `resources/css/ayuda*.css`: presentación institucional y adaptación móvil.
- `public/images/ayuda/`: GIF originales y alternativas estáticas.

Al agregar un módulo al registro de navegación, añada su entrada al catálogo. La prueba de cobertura detecta módulos sin guía. Para áreas importantes se utilizan atributos `data-guide` y selectores semánticos; los elementos ausentes muestran la explicación sin señalar un control incorrecto. Una pantalla sin registros conserva la ayuda.

## Verificación de la integración inicial

Compilación de producción correcta. Suite de 133 pruebas aprobada; cuatro pruebas específicas comprueban cobertura de rutas, alias, separación de reportes, ciclo de vida al navegar y preferencias de animación. Después de los ajustes se repitieron las pruebas específicas.

La optimización posterior retira los controles manuales y amplía la regresión. Véanse las medidas y comprobaciones actuales en `docs/performance/optimizacion-fps-capi.md`.

Se abrieron con cuentas reales las ayudas de los 35 módulos internos y se comprobó que el título y los temas correspondieran a la ruta. También se verificaron recorridos completos del acceso, carga documental, reportes, navegación común y registro público con un enlace vigente. En este último se comprobó el resaltado de identidad, cuenta, fotografía, PDF y envío, sin enviar una solicitud. Se probaron explicación puntual dentro de un expediente, salida rápida, repetición, recuperación de foco, navegación con teclado y presentación móvil de 390 px. Los dos GIF conservan los hashes de los originales.

La inspección encontró una CSP que impedía al visor institucional incrustar los PDF. Se permite `frame-ancestors 'self'` únicamente en respuestas `application/pdf`; HTML y JSON conservan `frame-ancestors 'none'`, y se mantiene `X-Frame-Options: SAMEORIGIN`. Se verificaron las tres variantes de cabeceras. La guía ofrece la descarga del PDF cuando el navegador no dispone de visor integrado.
