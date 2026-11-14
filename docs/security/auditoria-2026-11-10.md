# Registro de auditoría y regresión del 10 de noviembre de 2026

Estado: correcciones y pruebas funcionales realizadas; auditoría formal completa pendiente de validación. Este registro corresponde a la instantánea del 10 de noviembre. Los conteos de expedientes cambiaron después y no deben utilizarse como inventario del 11 de noviembre.

Se reforzaron autorización por rol/EPI, identificadores canónicos, acceso a archivos privados, confirmaciones de remisión y subsanación, transacciones de historial/versiones, enlaces públicos caducados y decisiones de registro. Se corrigieron respuestas tardías de una sesión anterior, exportaciones CSV que podían interpretarse como fórmulas, descargas PDF/Excel y errores de módulos después de una actualización. Se conservaron los diseños y se actualizaron dependencias compatibles.

Se trasladaron 68 archivos heredados a almacenamiento privado, comprobando sus huellas antes y después. Se verificaron 35 pantallas reales de los tres roles, seis exportaciones PDF/XLSX con gráficas editables en Excel, 50 comprobaciones de seguridad, 22 de remisión y 158 pruebas JavaScript en esa revisión. La auditoría de dependencias npm y Composer no informó avisos conocidos al finalizar esas actualizaciones. Los resultados detallados están en la carpeta local de evidencias.

El historial compacto redujo una respuesta observada de 1.416.817 a 407.698 bytes, y el resumen de documentos de 562.946 a 371.620 bytes, manteniendo el detalle bajo demanda.

## Límites explícitos

La skill [Cloudflare security-audit](C:/Users/ALEJANDRO/Documents/Codex/2026-11-08/hola-4/audit-skills/security-audit/SKILL.md) exige ejecutar procesos de destino “only inside an OS-enforced sandbox” con los controles adicionales definidos en su archivo. El entorno Windows disponible no proporcionó todos esos controles ni la protección no-follow requerida por sus validadores. Por eso sus artefactos formales se marcaron incompletos; no constituyen una certificación ni una auditoría exhaustiva aprobada.

Playwright CLI pudo instalarse y mostrar su ayuda, pero su arranque de Chrome falló por las restricciones del entorno. Las pruebas reales de navegador se hicieron con la herramienta de navegador disponible. React Doctor no produjo una puntuación válida pese a varios intentos; no se asignó un número. PHPUnit tampoco completó el arranque por la comprobación de lectura de su bootstrap; se utilizaron las comprobaciones ejecutables del proyecto y PostgreSQL con rollback. No se probaron todas las combinaciones posibles ni se hizo una prueba destructiva o de saturación.

En aquella instantánea, 260 de 262 rutas documentales apuntaban a PDFs físicos ausentes antes de las correcciones. No se fabricaron ni sustituyeron esos originales. Es un hallazgo histórico que requiere contrastar el inventario actual y recuperar archivos de una copia legítima. También queda pendiente validar con una reproducción aislada el alcance de las referencias de fotografías en los controladores; no se declara una explotación confirmada.

Evidencias locales: `C:\Users\ALEJANDRO\Documents\Codex\2026-11-08\hola-4\security-audit-2026-11-10`.

La prueba posterior de carga y revisión del escaneo está documentada en [rendimiento-documentos-2026-11-11.md](../rendimiento-documentos-2026-11-11.md).
