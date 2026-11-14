# Campus de EPIs y estados visuales

## Fallo corregido

Comando General trataba `/desempenio-epis` como un arreglo. El endpoint consolidado
devuelve `{ epis, resumen_global, por_estado, tipos_mas_usados, top_receptores_global }`.
La lista se descartaba silenciosamente, mientras otra petición llenaba los cuatro indicadores.
Ambos mandos usan ahora el mismo panel, con el contrato real y una sola petición.
Un error de contrato o de red muestra una acción de reintento.

## Interacción y alcance

- Campus con edificios y luces basados en los contadores reales, sin librería 3D.
- Búsqueda por nombre/zona, filtros por estado y cambio entre edificios y lista.
- Selección por botón y teclado, detalle por unidad y enlace compartible `?epi=ID`.
- El detalle muestra tipos de memorándum, destinatarios con fotos disponibles y secretario asignado.
- Campus reutilizado en los inicios de Comando General, Comando Departamental y Documentos por EPI.
- Inicio de Secretaría: edificio de su propia unidad y accesos a correcciones y carga documental.
- Estados vacíos compartidos con ilustración, contexto y acciones; aplicados también a gráficos y a las tres bandejas de notificaciones.
- Se mantienen el aislamiento por EPI, las rutas autenticadas y los archivos protegidos.

## Verificación

- Build de producción correcto.
- 125 pruebas JS aprobadas en 9 archivos; 8 regresiones específicas del campus.
- Las 8 regresiones del campus se repitieron tras ajustar el tamaño de los edificios.
- `php scripts/verify-campus.php`: 9 EPIs, 262 documentos y coherencia de estados entre paneles y comparativo.
- La verificación SQL se ejecutó en una transacción PostgreSQL de solo lectura.
- Comprobación de navegador local con sesión válida: nueve edificios, detalle por EPI, búsqueda, lista y recuperación de filtros.
- Comprobado a 1280 px y 375 px: el contenido no desborda horizontalmente; la cabecera mantiene su posición al enfocar y desplazar el campus. Menú móvil cerrado con Escape y sesión temporal cerrada al finalizar.
- La entrada mantiene carga diferida; los paneles de inicio reutilizan su respuesta existente y no agregan peticiones para los edificios.

Las capturas de esta revisión se guardan en `performance/campus-general.jpg` y
`performance/campus-mobile.jpg`. Las pruebas unitarias cubren los dos mandos;
la revisión visual interactiva se realizó con Comando General.
