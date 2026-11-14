# Portada, Capi y remisión confirmada

Implementado en el proyecto local de la Policía Boliviana.

- `/` presenta el flujo institucional en cuatro secciones. La red 3D es ilustrativa y no divulga expedientes ni simula estadísticas reales. `/login` conserva el acceso directo.
- Capi saluda al visitar una sección, ofrece consejos cada 120 segundos y comienza el recorrido de esa pantalla al pulsarlo. Su acceso es circular y lleva «¿Te ayudo?» encima. No contiene menús de pausa o silencio. No emite consejos sobre un diálogo abierto o una pestaña oculta.
- La emisión muestra todos los tipos vigentes. General puede elegir cuáles aparecen además como accesos directos.
- «Otros» conserva el nombre específico en el expediente, listados y reportes. Cinco remisiones registradas generan una sugerencia para General; solo su decisión explícita publica el tipo. Un rechazo se respeta hasta cinco usos adicionales. Este mecanismo observa frecuencia de uso; no entrena ni modifica automáticamente reglas de revisión.
- Antes de remitir, el servidor prepara una confirmación de 90 segundos ligada al usuario, EPI, huella del archivo y datos del trámite. El botón final exige la casilla de responsabilidad. Al vencer se desmarca y debe renovarse.
- Las observaciones automáticas permiten una remisión consciente para revisión humana. Se conservan en `revision_previa` y se muestran en el expediente de EPI, Departamental y General. La remisión mantiene el estado «Enviado por EPI» y no aprueba el documento.
- Se conservan los controles obligatorios de archivo, identidad, ámbito, referencia, fecha, tipo activo y código único. El servidor comprueba nuevamente la huella al registrar. Los reintentos con el mismo token devuelven el mismo expediente.
- Documento, versión inicial, historial y auditoría se guardan en una transacción.

## Base de datos

Migración: `2026_11_09_000001_confirmacion_envio_y_tipos_libres.php`, aplicada en el entorno local. Añade campos sin transformar los expedientes existentes.

En otra instalación se deben aplicar las migraciones antes de servir la nueva compilación. El caché del servidor debe conservar los tokens entre solicitudes y soportar bloqueos atómicos; con varias instancias debe ser compartido.

## Verificación

`npm test -- --pool=forks --maxWorkers=1` comprueba las vistas, navegación, Capi, cargas, permisos de interfaz y confirmación. `php scripts/verificar-remision.php` comprueba el flujo del servidor contra la conexión configurada, dentro de una transacción que se revierte y con un PDF exclusivo de prueba. Requiere cuentas de dos EPIs y General; no depende de contraseñas.

En navegador se comprobaron portada y diálogo en escritorio/móvil, acceso de los tres roles, recorrido directo, tipos disponibles, casilla obligatoria y caducidad/renovación real. El PDF de prueba se canceló antes de la remisión; el registro definitivo se verificó mediante rollback, para no introducir expedientes ficticios.

La revisión automática reconoció el PDF de prueba como ajeno a un memorándum. Esta prueba no certifica la precisión de reconocimiento para todos los escaneos reales.
