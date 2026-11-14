# Carga y revisión documental: prueba del 11 de noviembre de 2026

Se trabajó en `C:\laragon\www\ofbol`, con pruebas HTTP en `http://127.0.0.1:8001` y el servidor PHP local con OPcache. Se utilizó el PDF de CamScanner entregado por el usuario, de 286.293 bytes, una página escaneada y sin capa de texto. El archivo original se conservó sin cambios, con SHA-256 `ce829507f643113c4f7153ab8bfe1bab16b338ac9ce61aa2e503e05c3da0a992`.

## Mediciones reales

Los tiempos siguientes tienen condiciones distintas y no deben interpretarse como una promesa para cualquier documento o equipo.

| Operación | Tiempo observado | Condición |
|---|---:|---|
| Revisión inicial anterior | 32,68 s | Modelo descargado, todavía fuera de memoria; incluye su carga |
| Revisión anterior repetida | 6,31 s | Modelo y prefijo ya preparados |
| Primera lectura tras preparar el modelo | 18,45 s | Primera evaluación de imagen/prefijo; incluyó una segunda consulta para confirmar la firma |
| Revisión por HTTP con modelo preparado | 5,33 s | Lectura forzada, sin reutilizar evidencia de la aplicación |
| Otra lectura forzada por HTTP | 4,32 s | Mismo archivo y modelo en memoria |
| Comparar de nuevo tipo/destinatario | 0,65–0,88 s | Se conservó la extracción, se recalcularon las comparaciones |
| Cargar y guardar el PDF entregado | 0,55 s | HTTP real; unos 83 ms dentro del controlador de carga |
| Cargar archivo de 50 MiB | 26,66 s | HTTP real; unos 550 ms de validación, guardado y SHA-256 en el controlador |
| Revisar archivo de 50 MiB | 29,68 s | HTTP real; 4,78 s correspondieron al análisis, el resto a recepción y preparación de la petición |

Las pruebas del límite utilizaron una copia controlada del PDF con espacio en blanco permitido después de `%%EOF`, hasta completar exactamente 52.428.800 bytes. Se comprobó que seguía siendo legible, que el servidor conservaba todos sus bytes y que la huella coincidía. No equivale a probar 50 MiB de páginas distintas o imágenes comprimidas extremas. Con 52.428.801 bytes la carga fue rechazada con HTTP 422.

La medida de 26,66 s incluye el transporte del entorno local de pruebas. `Server-Timing` permite distinguirlo del trabajo del controlador. No se atribuye toda esa demora a la IA ni se promete que una red más lenta transfiera 50 MiB en el mismo tiempo.

## Cambios aplicados

- Se conservó `qwen2.5-vl-3b-instruct`, sus pesos existentes, el prompt documental, los 150 DPI y el lado final de 1280 píxeles. No se descargó otro modelo.
- En escaneos se prepara la página completa al comprobar el encabezado. Se reutiliza dentro de la petición, evitando un segundo proceso Python y el renderizado de una franja que no se usaba. La imagen de este documento resultó idéntica píxel por píxel a la anterior: 904 × 1280.
- Se acotó el bitmap intermedio de páginas con dimensiones extremas, conservando supermuestreo. No se comprime, modifica ni sustituye el PDF original.
- La evidencia completa se conserva durante 15 minutos en caché privada por usuario, EPI, huella del archivo, modelo, prompt y parámetros de imagen. Se conservan las comprobaciones adicionales de firma y sello. Los fallos y respuestas parciales no se memorizan.
- Al modificar el tipo, el nombre libre o el oficial, la interfaz envía una referencia temporal y los datos actuales. El servidor comprueba el propietario y vuelve a comparar. La prueba de ese cambio transfirió solo 145 bytes de JSON, sin volver a enviar el PDF.
- Cada comparación emite una revisión nueva con el contexto actual. La confirmación de remisión de 90 segundos y la autorización final siguen funcionando por separado. La caché no aprueba documentos ni reutiliza permisos.
- Al caducar la lectura, la interfaz vuelve a adjuntar el archivo automáticamente. Una referencia ajena se rechaza; no dispara una carga de recuperación. El reintento explícito fuerza una lectura nueva.
- Por defecto no hay corte por duración para la inferencia ni para la carga del PDF en el navegador. Se mantiene la detección de conexión fallida, errores de red y las protecciones del rasterizador. Un proxy o servidor externo puede imponer sus propios límites; no se cambió configuración global de infraestructura.
- Se solicita a LM Studio `store: false`, evitando crear una conversación persistente por cada lectura.
- Se añadió `Server-Timing` para medir validación, guardado y huella de la carga sin exponer datos personales.

## Preparar el modelo existente

La primera carga de pesos y el primer procesamiento de una imagen todavía pueden tardar más que una revisión repetida. Se probó el mismo modelo con contexto 4096, una predicción simultánea y descarga de cómputo a GPU. La lectura de prueba utiliza aproximadamente 1889 tokens de entrada y cabe en ese contexto.

```powershell
.\scripts\preparar-ia.ps1
```

El script conserva un modelo que ya esté cargado y solo carga los pesos configurados que ya existen. No ejecuta descargas. También puede prepararse antes de iniciar el servidor local:

```powershell
.\scripts\iniciar-servidor.ps1 -PrepararIA
```

## Validación y límites

- 162 pruebas JavaScript pasaron en 17 archivos y compiló la versión de producción.
- Pasaron las 22 comprobaciones de remisión y las 50 comprobaciones de seguridad del proyecto, con rollback y conservación de los registros de negocio.
- Se comprobó por HTTP la carga original, los límites de tamaño, la revisión de 50 MiB, cambios de contexto, reintento forzado y aislamiento entre EPIs.
- Se probaron referencias ajenas, caducadas y entradas ambiguas, y se conservó el rechazo de oficiales de otra EPI.
- Se utilizó la interfaz real con la cuenta EPI y el escaneo original. Se reconocieron el tipo de designación, la fecha del documento y la presencia de firma y sello. No se registró ni remitió ese memorándum a un comando.
- Se eliminaron cuatro archivos físicos de pruebas después de comprobar propietario, huella y ausencia de expediente registrado. El original de Descargas permaneció intacto. El total de documentos de negocio se conservó en 1200 durante esa limpieza.
- La revisión rápida conserva su alcance anterior: primera página. Aceptar un PDF de 50 MiB no significa que se hayan analizado todas las páginas de un expediente multipágina.
- Un escaneo verificado no demuestra exactitud universal. PDFs dañados, imágenes ilegibles, cargas concurrentes y equipos distintos requieren sus propias pruebas. No se ejecutó una prueba de carga de múltiples usuarios ni una inferencia de más de seis minutos.

Evidencias y scripts locales reproducibles: `C:\Users\ALEJANDRO\Documents\Codex\2026-11-08\hola-4\outputs\upload-audit-2026-11-11`. Los JSON y la captura contienen datos del documento de prueba y se mantienen fuera del repositorio.
