# Reportes institucionales

La pantalla de cada rol consulta `/api/reportes` con sesión activa. El servidor determina el ámbito; el navegador solo selecciona fechas y una EPI dentro del ámbito autorizado.

| Rol | Reportes |
| --- | --- |
| Secretaría EPI | Seguimiento de su estación; emisión y tipos de trámite; documentos por oficial |
| Comando Departamental | Supervisión de sus EPIs; dictámenes y motivos de observación; antigüedad de pendientes |
| Comando General | Balance de registro oficial; tendencia y demanda; evidencia de trazabilidad |

En esta instalación el rol departamental corresponde al comando de La Paz. `REPORTES_COMANDO_DEPARTAMENTAL_ID` fija ese ámbito desde el servidor. Si se incorporan cuentas de otros comandos, se debe modelar su asignación individual antes de habilitarlas.

## Descargas

Cada consulta crea una instantánea privada de 20 minutos, vinculada al usuario y sus permisos. La exportación acepta únicamente el identificador de esa instantánea y un reporte de su rol. La pantalla y el archivo utilizan los mismos datos y filtros. Una instantánea vencida requiere pulsar **Actualizar**. No se aceptan cifras ni fórmulas suministradas por el navegador.

El PDF incluye gráficas vectoriales, filtros, fecha de corte y todo el detalle paginado. El XLSX incluye hojas **Reporte**, **Datos gráficas** y **Detalle**. Sus gráficas son objetos nativos de Excel vinculados a celdas; se pueden editar datos, títulos, colores y tipo de gráfica en la copia descargada. Los indicadores se enlazan a los valores de la instantánea: editar la copia no recalcula las reglas de negocio ni modifica la base de datos. El texto se exporta como texto para evitar la ejecución de fórmulas procedentes de registros.

## Requisitos de ejecución

El exportador utiliza Python 3, XlsxWriter y ReportLab. Están disponibles en el intérprete configurado de este equipo. En otra instalación:

```powershell
python -m pip install -r scripts/requirements-reportes.txt
```

Configure `REPORTES_PYTHON` con la ruta absoluta del intérprete si el servidor web utiliza un PATH diferente. No depende de Microsoft Office ni de su licencia. Los archivos temporales se guardan en `storage/app/private/exportaciones` y se eliminan tras enviarse. Requiere permiso de escritura en storage. Máximo 50.000 documentos por consulta y 12 solicitudes de exportación por minuto; acote fechas para volúmenes mayores.

Los totales documentales corresponden a la fecha de emisión/carga y su estado al corte. El reporte de dictámenes usa la fecha de revisión y cuenta dictámenes, no documentos únicos. La antigüedad es calendario y no declara incumplimientos legales. La evidencia de trazabilidad comprueba metadatos registrados; no recalcula el hash del archivo PDF. La cobertura se limita a las dependencias incorporadas al sistema.

## Verificación realizada

- Compilación de producción y 129 pruebas de interfaz aprobadas; después del ajuste del formulario se repitieron las 11 pruebas específicas de reportes.
- Consulta de la base local en transacción de solo lectura: 30 documentos de San Pedro, 262 del ámbito institucional y 201 dictámenes departamentales al corte de la revisión.
- Nueve controles del servidor: EPI ajena, fechas inválidas o invertidas, instantánea de otro usuario, reporte de otro rol, formato inválido, permisos cambiados, instantánea caducada y ausencia de sesión.
- Generación de los nueve reportes en ambos formatos, con datos y con período vacío: 36 archivos comprobados. PDFs revisados por extracción y límites de página; muestras renderizadas visualmente. XLSX verificados por su estructura de gráficas nativas y referencias a las celdas.
- Inicio de sesión real de los tres roles y descarga PDF/XLSX desde la interfaz. Filtro por San Pedro y período 2026-01-01 a 2026-10-31: pantalla y Excel coinciden en 12 dictámenes y una observación.
- Vista de escritorio y vista móvil de 390 px, sin desbordamiento horizontal del documento. Los textos que empiezan por `=` se conservan como texto en Excel.

No se verificó la edición interactiva dentro de Microsoft Excel ni compatibilidad con todas sus versiones. Sí se verificaron los objetos nativos de gráfica y sus referencias editables; no son capturas de pantalla.
