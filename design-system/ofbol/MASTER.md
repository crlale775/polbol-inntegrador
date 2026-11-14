# OFBOL · Interfaz operativa institucional

Base: skill local UI UX Pro Max, consultas `government operations dashboard accessible`,
`data dense dashboard --domain style` y `lazy routes --stack react`.
Se adoptan accesibilidad, contraste, navegación clara y densidad moderada. El patrón
de landing de la consulta general no se aplica a las pantallas operativas.

## Identidad y lectura

- Verde institucional `#285343`; navegación `#153c30`; papel `#f3f5f0`.
- Superficie `#fffefa`, tinta `#192d27`, metadatos `#53655b`.
- Estados conservan su semántica: rojo para error, ámbar para pendiente, verde para éxito.
- Fuentes del sistema; no descargas de tipografías que retrasen el primer render.
- Una acción primaria por pantalla, tablas con filas legibles, detalles secundarios subordinados.
- Escudo oficial con transparencia y proporciones conservadas; copias WebP adaptadas a su tamaño de uso.

## Estructura compartida

- Shell persistente para los tres roles. Solo cambia el contenido de la ruta.
- Sidebar de 264 px o 76 px contraída, elección conservada en la sesión.
- Navegación agrupada por operación, análisis, administración y cuenta.
- Cabecera de 72 px; en ancho menor a 900 px se usa un drawer con Escape y control de foco.
- Tarjetas con radio de 12 px, controles de al menos 44 px en móvil, foco visible.
- Tablas con contraste y resaltado de fila; sin movimiento continuo decorativo.

## Rendimiento y comportamiento

- Búsqueda global descargada al usarla por primera vez.
- Rutas diferidas y precarga por intención (hover/foco), con precarga ociosa secuencial.
- La precarga ociosa respeta ahorro de datos, redes 2G y pestañas ocultas.
- GET concurrentes deduplicados; catálogos en memoria hasta 60 s, con invalidación en escrituras y cambios de sesión.
- Documentos y paneles no usan caché de respuestas persistente.
- Transiciones CSS breves y respeto de `prefers-reduced-motion`.

## Verificación

Pruebas de navegación, cuenta, vistas, filtros, cargas y caché en `tests/js`.
Las mediciones reproducibles están en `scripts/measure-bundle.mjs` y
`scripts/benchmark-panels.php`. El segundo usa una transacción PostgreSQL de solo lectura.
La revisión visual real de navegador queda pendiente si la herramienta no puede identificar su URL.
