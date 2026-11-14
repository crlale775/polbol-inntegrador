# OFBOL — Mapa del proyecto (generado con Graphify)

Pega este archivo (o el HTML) al inicio de cada chat para que Claude tenga el contexto del proyecto.
Fuente completa e interactiva: `graphify-out/graph.html`, `graphify-out/graph.json`, `graphify-out/GRAPH_REPORT.md`.

## Stack
- Backend: Laravel 13 (PHP 8.3) · `app/Http/Controllers` (36) · `app/Models` (28) · `app/Services` (9) · middleware `SesionActiva`, `PermisosInstitucionales`, `SecurityHeaders`
- Frontend: React SPA (Vite) montada desde `resources/js/app.jsx`; vistas en `resources/views/<rol>/*.jsx`; cliente HTTP `resources/js/lib/api.js` (base `/api`, CSRF por cookie XSRF)
- `routes/web.php` sirve la SPA para cualquier ruta; toda la API vive en `routes/api.php` (rutas protegidas por sesión + permisos institucionales)
- Roles: secretario_unidad (EPI) · secretario_comando_departamental · comando_general

## Pantallas SPA → vista → endpoints que llama
- `/` → `resources/views/inicio/Inicio.jsx`
- `/comando-departamental/dashboard` → `resources/views/secretario_comando_departamental/Dashboard.jsx` → GET /api/panel/departamental
- `/comando-departamental/desempenio` → `resources/views/secretario_comando_departamental/DesempenioEpis.jsx` [vía DesempenioEpisPanel.jsx: GET /api/desempenio-epis]
- `/comando-departamental/documentos-epi` → `resources/views/secretario_comando_departamental/DocumentosPorEpi.jsx` → GET /api/documentos, GET /api/epis
- `/comando-departamental/historial` → `resources/views/secretario_comando_departamental/Historial.jsx` → GET /api/documentos, GET /api/epis, GET /api/historial-estados
- `/comando-departamental/notificaciones` → `resources/views/secretario_comando_departamental/Notificaciones.jsx` → GET /api/me, PUT /api/notificaciones/{id}
- `/comando-departamental/observaciones` → `resources/views/secretario_comando_departamental/Observaciones.jsx` → GET /api/documentos, GET /api/epis, GET /api/revisiones
- `/comando-departamental/perfil` → `resources/views/secretario_comando_departamental/Perfil.jsx`
- `/comando-departamental/reportes` → `resources/views/secretario_comando_departamental/Reportes.jsx` [vía ReportesEngine.jsx: GET /api/reportes, GET /api/reportes/exportar]
- `/comando-departamental/revision` → `resources/views/secretario_comando_departamental/RevisarDocumentos.jsx` → GET /api/documentos, GET /api/documentos/{id}, GET /api/epis, GET /api/estados-documento, GET /api/tipos-documento, GET /api/tipos-observacion, POST /api/notificaciones, POST /api/revisiones, PUT /api/documentos/{id}
- `/comando-departamental/secretarios` → `resources/views/secretario_comando_departamental/GestionSecretarios.jsx` → GET /api/epis, GET /api/usuarios, POST /api/usuarios, POST /api/usuarios/{id}/reset-password, PUT /api/usuarios/{id}
- `/comando-departamental/trazabilidad` → `resources/views/secretario_comando_departamental/Trazabilidad.jsx` [vía RecorridoInstitucional.jsx: GET /api/documentos, GET /api/documentos/{id}/trazabilidad, GET /api/epis]
- `/comando-general/auditoria` → `resources/views/comando_general/Auditoria.jsx` → GET /api/auditorias, GET /api/epis
- `/comando-general/comparativo` → `resources/views/comando_general/ComparativoGeneral.jsx` [vía DesempenioEpisPanel.jsx: GET /api/desempenio-epis]
- `/comando-general/dashboard` → `resources/views/comando_general/Dashboard.jsx` → GET /api/panel/general
- `/comando-general/directorio` → `resources/views/comando_general/DirectorioInstitucional.jsx` → GET /api/epis, GET /api/grados, GET /api/oficiales
- `/comando-general/documentos` → `resources/views/comando_general/DocumentosAprobados.jsx` → GET /api/documentos, GET /api/documentos/{id}, GET /api/epis, GET /api/estados-documento, GET /api/revisiones, GET /api/tipos-documento, POST /api/notificaciones, POST /api/revisiones, PUT /api/documentos/{id}
- `/comando-general/historial` → `resources/views/comando_general/Historial.jsx` → GET /api/documentos, GET /api/epis
- `/comando-general/notificaciones` → `resources/views/comando_general/Notificaciones.jsx` → GET /api/me, PUT /api/notificaciones/{id}
- `/comando-general/perfil` → `resources/views/comando_general/Perfil.jsx`
- `/comando-general/registro` → `resources/views/comando_general/RegistroDocumental.jsx` → GET /api/documentos, GET /api/epis, GET /api/tipos-documento
- `/comando-general/registro-oficiales` → `resources/views/comando_general/RegistroOficialesIA.jsx` → GET /api/epis, GET /api/registro-links, GET /api/roles, GET /api/solicitudes-registro, GET /api/solicitudes-registro/{id}, POST /api/registro-links, POST /api/registro-links/{id}/cancelar, POST /api/solicitudes-registro/{id}/adjuntos, POST /api/solicitudes-registro/{id}/aprobar, POST /api/solicitudes-registro/{id}/rechazar, POST /api/solicitudes-registro/{id}/verificar-ia
- `/comando-general/reportes` → `resources/views/comando_general/Reportes.jsx` [vía ReportesEngine.jsx: GET /api/reportes, GET /api/reportes/exportar]
- `/comando-general/tipos-memo` → `resources/views/comando_general/GestionTiposMemo.jsx` → DELETE /api/tipos-memo/{id}, GET /api/tipos-memo, POST /api/tipos-memo, PUT /api/tipos-memo/{id} [vía SugerenciasTipos.jsx: POST /api/tipos-memo/sugerencias/decision]
- `/comando-general/trazabilidad` → `resources/views/comando_general/Trazabilidad.jsx` [vía RecorridoInstitucional.jsx: GET /api/documentos, GET /api/documentos/{id}/trazabilidad, GET /api/epis]
- `/comando-general/usuarios` → `resources/views/comando_general/GestionUsuarios.jsx` → GET /api/epis, GET /api/roles, GET /api/usuarios, POST /api/usuarios, PUT /api/usuarios/{id}
- `/login` → `resources/views/login/Login.jsx` → POST /api/login [vía Auditoria.jsx: GET /api/auditorias, GET /api/epis; vía Correcciones.jsx: GET /api/documentos/{id}, GET /api/me, GET /api/sync/ping, POST /api/documentos/{id}/preparar-subsanacion, POST /api/documentos/{id}/subsanar, POST /api/upload-documento; vía Dashboard.jsx: GET /api/notificaciones, GET /api/panel/departamental, GET /api/panel/general, GET /api/panel/unidad; vía DirectorioInstitucional.jsx: GET /api/epis, GET /api/grados, GET /api/oficiales; vía DocumentosAprobados.jsx: GET /api/documentos, GET /api/documentos/{id}, GET /api/epis, GET /api/estados-documento, GET /api/revisiones, GET /api/tipos-documento, POST /api/notificaciones, POST /api/revisiones, PUT /api/documentos/{id}; vía DocumentosPorEpi.jsx: GET /api/documentos, GET /api/epis; vía GestionSecretarios.jsx: GET /api/epis, GET /api/usuarios, POST /api/usuarios, POST /api/usuarios/{id}/reset-password, PUT /api/usuarios/{id}; vía GestionTiposMemo.jsx: DELETE /api/tipos-memo/{id}, GET /api/tipos-memo, POST /api/tipos-memo, PUT /api/tipos-memo/{id}; vía GestionUsuarios.jsx: GET /api/epis, GET /api/roles, GET /api/usuarios, POST /api/usuarios, PUT /api/usuarios/{id}; vía Historial.jsx: GET /api/documentos, GET /api/epis, GET /api/historial-estados, GET /api/me; vía MisDocumentos.jsx: GET /api/estados-documento, GET /api/me, GET /api/revisiones, GET /api/tipos-documento; vía Notificaciones.jsx: GET /api/me, PUT /api/notificaciones/{id}; vía Observaciones.jsx: GET /api/documentos, GET /api/epis, GET /api/revisiones; vía OficialesEpi.jsx: GET /api/cargos, GET /api/documentos, GET /api/grados, GET /api/me; vía Perfil.jsx: POST /api/upload-foto; vía Plantillas.jsx: GET /api/plantillas, GET /api/plantillas/{id}/archivo; vía RegistroDocumental.jsx: GET /api/documentos, GET /api/epis, GET /api/tipos-documento; vía RegistroOficialesIA.jsx: GET /api/epis, GET /api/registro-links, GET /api/roles, GET /api/solicitudes-registro, GET /api/solicitudes-registro/{id}, POST /api/registro-links, POST /api/registro-links/{id}/cancelar, POST /api/solicitudes-registro/{id}/adjuntos, POST /api/solicitudes-registro/{id}/aprobar, POST /api/solicitudes-registro/{id}/rechazar, POST /api/solicitudes-registro/{id}/verificar-ia; vía RevisarDocumentos.jsx: GET /api/documentos, GET /api/documentos/{id}, GET /api/epis, GET /api/estados-documento, GET /api/tipos-documento, GET /api/tipos-observacion, POST /api/notificaciones, POST /api/revisiones, PUT /api/documentos/{id}; vía SubirDocumento.jsx: GET /api/estados-documento, GET /api/me, GET /api/sync/ping, GET /api/tipos-documento, POST /api/documentos, POST /api/documentos/preparar-envio, POST /api/upload-documento]
- `/registro-oficial/:token` → `resources/views/login/RegistroOficial.jsx` → GET /api/registro-links/publico/{token}, POST /api/registro-publico/{token}
- `/secretario/correcciones` → `resources/views/secretario_unidad/Correcciones.jsx` → GET /api/documentos/{id}, GET /api/me, GET /api/sync/ping, POST /api/documentos/{id}/preparar-subsanacion, POST /api/documentos/{id}/subsanar, POST /api/upload-documento [vía revisionDocumento.js: POST /api/documentos/revisar-ia]
- `/secretario/dashboard` → `resources/views/secretario_unidad/Dashboard.jsx` → GET /api/notificaciones, GET /api/panel/unidad
- `/secretario/historial` → `resources/views/secretario_unidad/Historial.jsx` → GET /api/historial-estados, GET /api/me
- `/secretario/mis-documentos` → `resources/views/secretario_unidad/MisDocumentos.jsx` → GET /api/estados-documento, GET /api/me, GET /api/revisiones, GET /api/tipos-documento
- `/secretario/notificaciones` → `resources/views/secretario_unidad/Notificaciones.jsx` → GET /api/me, PUT /api/notificaciones/{id}
- `/secretario/oficiales` → `resources/views/secretario_unidad/OficialesEpi.jsx` → GET /api/cargos, GET /api/documentos, GET /api/grados, GET /api/me
- `/secretario/perfil` → `resources/views/secretario_unidad/Perfil.jsx` → POST /api/upload-foto
- `/secretario/plantillas` → `resources/views/secretario_unidad/Plantillas.jsx` → GET /api/plantillas, GET /api/plantillas/{id}/archivo
- `/secretario/reportes` → `resources/views/secretario_unidad/Reportes.jsx` [vía ReportesEngine.jsx: GET /api/reportes, GET /api/reportes/exportar]
- `/secretario/subir-documento` → `resources/views/secretario_unidad/SubirDocumento.jsx` → GET /api/estados-documento, GET /api/me, GET /api/sync/ping, GET /api/tipos-documento, POST /api/documentos, POST /api/documentos/preparar-envio, POST /api/upload-documento [vía revisionDocumento.js: POST /api/documentos/revisar-ia]

## API: ruta → Controlador@método
### ArticuloController  (usa: Articulo)
- DELETE /api/articulos/{id} → `destroy()`
- GET /api/articulos/{id} → `show()`
- PUT /api/articulos/{id} → `update()`
- GET /api/articulos → `index()`
- POST /api/articulos → `store()`
### AuditoriaController  (usa: Auditoria)
- DELETE /api/auditorias/{id} → `destroy()`
- GET /api/auditorias/{id} → `show()`
- PUT /api/auditorias/{id} → `update()`
- GET /api/auditorias → `index()`  ← Auditoria
- POST /api/auditorias → `store()`
### AuthController  (usa: Sesion, Usuario)
- POST /api/login → `login()`  ← Login, sesion-peticiones-tardias.test
- POST /api/logout → `logout()`  ← AuthContext, sesion-peticiones-tardias.test
- GET /api/me → `actual()`  ← AuthContext, Correcciones, Historial, MisDocumentos, Notificaciones, OficialesEpi, SubirDocumento, sesion-peticiones-tardias.test
### CargoController  (usa: Cargo)
- DELETE /api/cargos/{id} → `destroy()`
- GET /api/cargos/{id} → `show()`
- PUT /api/cargos/{id} → `update()`
- GET /api/cargos → `index()`  ← OficialesEpi
- POST /api/cargos → `store()`
### CatalogoController  (usa: CargoController, ComandoDepartamentalController, EpiController, EstadoDocumentoController, GradoController, RolController, TipoDocumentoController, TipoObservacionController)
- GET /api/catalogos → `index()`
### ComandoDepartamentalController  (usa: ComandoDepartamental)
- DELETE /api/comando-departamental/{id} → `destroy()`
- GET /api/comando-departamental/{id} → `show()`
- PUT /api/comando-departamental/{id} → `update()`
- GET /api/comando-departamental → `index()`
- POST /api/comando-departamental → `store()`
### ConfiguracionController  (usa: Configuracion)
- DELETE /api/configuraciones/{id} → `destroy()`
- GET /api/configuraciones/{id} → `show()`
- PUT /api/configuraciones/{id} → `update()`
- GET /api/configuraciones → `index()`
- POST /api/configuraciones → `store()`
### ConfirmacionEnvioController
- POST /api/documentos/preparar-envio → `preparar()`  ← SubirDocumento
- POST /api/documentos/{id}/preparar-subsanacion → `prepararSubsanacion()`  ← Correcciones
- POST /api/documentos/{id}/subsanar → `subsanar()`  ← Correcciones
### DocumentoController  (usa: ConfirmacionEnvio, Documento, Epi, HistorialEstado, Oficial, TipoDocumento, Usuario, VerificadorIA, VersionDocumento)
- GET /api/archivos/documento → `archivoPorRuta()`
- GET /api/desempenio-epis → `desempenioEpis()`  ← DesempenioEpisPanel
- POST /api/documentos/revisar-ia → `revisarIA()`  ← carga-archivos.test, revisionDocumento
- GET /api/documentos/{id}/archivo → `archivo()`
- GET /api/documentos/{id}/trazabilidad → `trazabilidad()`  ← RecorridoInstitucional
- DELETE /api/documentos/{id} → `destroy()`
- GET /api/documentos/{id} → `show()`  ← Correcciones, DocumentosAprobados, RevisarDocumentos
- PUT /api/documentos/{id} → `update()`  ← DocumentosAprobados, RevisarDocumentos
- GET /api/documentos → `index()`  ← DocumentosAprobados, DocumentosPorEpi, Historial, Observaciones, OficialesEpi, RecorridoInstitucional, RegistroDocumental, RevisarDocumentos, api, sesion-peticiones-tardias.test
- POST /api/documentos → `store()`  ← SubirDocumento, api
- GET /api/estadisticas-generales → `estadisticasGenerales()`
- POST /api/upload-documento → `subirArchivo()`  ← Correcciones, SubirDocumento, carga-archivos.test
### EpiController  (usa: Epi)
- DELETE /api/epis/{id} → `destroy()`
- GET /api/epis/{id} → `show()`
- PUT /api/epis/{id} → `update()`
- GET /api/epis → `index()`  ← Auditoria, DirectorioInstitucional, DocumentosAprobados, DocumentosPorEpi, GestionSecretarios, GestionUsuarios, Historial, Observaciones, RecorridoInstitucional, RegistroDocumental, RegistroOficialesIA, RevisarDocumentos
- POST /api/epis → `store()`
### EstadoDocumentoController  (usa: EstadoDocumento)
- DELETE /api/estados-documento/{id} → `destroy()`
- GET /api/estados-documento/{id} → `show()`
- PUT /api/estados-documento/{id} → `update()`
- GET /api/estados-documento → `index()`  ← DocumentosAprobados, MisDocumentos, RevisarDocumentos, SubirDocumento
- POST /api/estados-documento → `store()`
### FlujoDocumentoController  (usa: FlujoDocumento)
- DELETE /api/flujo-documentos/{id} → `destroy()`
- GET /api/flujo-documentos/{id} → `show()`
- PUT /api/flujo-documentos/{id} → `update()`
- GET /api/flujo-documentos → `index()`
- POST /api/flujo-documentos → `store()`
### GradoController  (usa: Grado)
- DELETE /api/grados/{id} → `destroy()`
- GET /api/grados/{id} → `show()`
- PUT /api/grados/{id} → `update()`
- GET /api/grados → `index()`  ← DirectorioInstitucional, OficialesEpi
- POST /api/grados → `store()`
### HistorialDestinoController  (usa: HistorialDestino)
- DELETE /api/historial-destinos/{id} → `destroy()`
- GET /api/historial-destinos/{id} → `show()`
- PUT /api/historial-destinos/{id} → `update()`
- GET /api/historial-destinos → `index()`
- POST /api/historial-destinos → `store()`
### HistorialEstadoController  (usa: HistorialEstado)
- DELETE /api/historial-estados/{id} → `destroy()`
- GET /api/historial-estados/{id} → `show()`
- PUT /api/historial-estados/{id} → `update()`
- GET /api/historial-estados → `index()`  ← Historial
- POST /api/historial-estados → `store()`
### MetricasController
- GET /api/metricas/reportes → `reportes()`
### NormaController  (usa: Norma)
- DELETE /api/normas/{id} → `destroy()`
- GET /api/normas/{id} → `show()`
- PUT /api/normas/{id} → `update()`
- GET /api/normas → `index()`
- POST /api/normas → `store()`
### NotificacionController  (usa: Notificacion)
- DELETE /api/notificaciones/{id} → `destroy()`
- GET /api/notificaciones/{id} → `show()`
- PUT /api/notificaciones/{id} → `update()`  ← Notificaciones
- GET /api/notificaciones → `index()`  ← Dashboard, SidebarShell
- POST /api/notificaciones → `store()`  ← DocumentosAprobados, RevisarDocumentos
### OficialController  (usa: Oficial)
- DELETE /api/oficiales/{id} → `destroy()`
- GET /api/oficiales/{id} → `show()`
- PUT /api/oficiales/{id} → `update()`
- GET /api/oficiales → `index()`  ← DirectorioInstitucional
- POST /api/oficiales → `store()`
### PanelController  (usa: Documento, Epi, TipoDocumento)
- GET /api/panel/departamental → `departamental()`  ← Dashboard
- GET /api/panel/general → `general()`  ← Dashboard
- GET /api/panel/unidad → `unidad()`  ← Dashboard
### PlantillaController  (usa: Plantilla)
- GET /api/plantillas/{id}/archivo → `archivo()`  ← Plantillas, sesion-peticiones-tardias.test
- DELETE /api/plantillas/{id} → `destroy()`
- GET /api/plantillas/{id} → `show()`
- PUT /api/plantillas/{id} → `update()`
- GET /api/plantillas → `index()`  ← Plantillas
- POST /api/plantillas → `store()`
### RegistroLinkController  (usa: RegistroLink)
- GET /api/registro-links/publico/{token} → `publico()`  ← RegistroOficial
- POST /api/registro-links/{id}/cancelar → `cancelar()`  ← RegistroOficialesIA
- GET /api/registro-links → `index()`  ← RegistroOficialesIA
- POST /api/registro-links → `store()`  ← RegistroOficialesIA
### ReglaController  (usa: Regla)
- DELETE /api/reglas/{id} → `destroy()`
- GET /api/reglas/{id} → `show()`
- PUT /api/reglas/{id} → `update()`
- GET /api/reglas → `index()`
- POST /api/reglas → `store()`
### ReporteInstitucionalController
- GET /api/reportes/exportar → `exportar()`  ← ReportesEngine
- GET /api/reportes → `index()`  ← ReportesEngine
### RevisionController  (usa: Revision)
- DELETE /api/revisiones/{id} → `destroy()`
- GET /api/revisiones/{id} → `show()`
- PUT /api/revisiones/{id} → `update()`
- GET /api/revisiones → `index()`  ← DocumentosAprobados, MisDocumentos, Observaciones
- POST /api/revisiones → `store()`  ← DocumentosAprobados, RevisarDocumentos
### RolController  (usa: Rol)
- DELETE /api/roles/{id} → `destroy()`
- GET /api/roles/{id} → `show()`
- PUT /api/roles/{id} → `update()`
- GET /api/roles → `index()`  ← GestionUsuarios, RegistroOficialesIA
- POST /api/roles → `store()`
### SesionController  (usa: Sesion)
- DELETE /api/sesiones/{id} → `destroy()`
- GET /api/sesiones/{id} → `show()`
- PUT /api/sesiones/{id} → `update()`
- GET /api/sesiones → `index()`
- POST /api/sesiones → `store()`
### SincronizacionController  (usa: Documento, SolicitudRegistro)
- GET /api/sync/estado → `estado()`  ← sesion-peticiones-tardias.test, useSincronizacion
- GET /api/sync/ping → `ping()`  ← Correcciones, SubirDocumento
### SolicitudRegistroController  (usa: ArchivosRegistro, Auditoria, RegistroLink, SolicitudRegistro, Usuario, VerificacionRegistro, VerificadorIA)
- POST /api/registro-publico/{token} → `registrarPublico()`  ← RegistroOficial
- POST /api/solicitudes-registro/{id}/adjuntos → `actualizarAdjuntos()`  ← RegistroOficialesIA
- POST /api/solicitudes-registro/{id}/aprobar → `aprobar()`  ← RegistroOficialesIA
- GET /api/solicitudes-registro/{id}/archivo/{tipo} → `archivo()`
- POST /api/solicitudes-registro/{id}/rechazar → `rechazar()`  ← RegistroOficialesIA
- POST /api/solicitudes-registro/{id}/verificar-ia → `verificarIA()`  ← RegistroOficialesIA
- GET /api/solicitudes-registro/{id} → `show()`  ← RegistroOficialesIA
- GET /api/solicitudes-registro → `index()`  ← RegistroOficialesIA
### SugerenciaTipoController
- POST /api/tipos-memo/sugerencias/decision → `decidir()`  ← SugerenciasTipos
### TipoDocumentoController  (usa: TipoDocumento, TipoMemo)
- DELETE /api/tipos-documento/{id} → `destroy()`
- GET /api/tipos-documento/{id} → `show()`
- PUT /api/tipos-documento/{id} → `update()`
- GET /api/tipos-documento → `index()`  ← DocumentosAprobados, MisDocumentos, RegistroDocumental, RevisarDocumentos, SubirDocumento
- POST /api/tipos-documento → `store()`
### TipoMemoController  (usa: Auditoria, Documento, SugerenciasTipos, TipoDocumento, TipoMemo)
- DELETE /api/tipos-memo/{id} → `destroy()`  ← GestionTiposMemo
- GET /api/tipos-memo/{id} → `show()`
- PUT /api/tipos-memo/{id} → `update()`  ← GestionTiposMemo
- GET /api/tipos-memo → `index()`  ← GestionTiposMemo
- POST /api/tipos-memo → `store()`  ← GestionTiposMemo
### TipoObservacionController  (usa: TipoObservacion)
- DELETE /api/tipos-observacion/{id} → `destroy()`
- GET /api/tipos-observacion/{id} → `show()`
- PUT /api/tipos-observacion/{id} → `update()`
- GET /api/tipos-observacion → `index()`  ← RevisarDocumentos
- POST /api/tipos-observacion → `store()`
### UsuarioController  (usa: Oficial, Usuario)
- GET /api/fotos → `foto()`
- POST /api/upload-foto → `subirFoto()`  ← Perfil
- POST /api/usuarios/{id}/reset-password → `resetPassword()`  ← GestionSecretarios
- DELETE /api/usuarios/{id} → `destroy()`
- GET /api/usuarios/{id} → `show()`
- PUT /api/usuarios/{id} → `update()`  ← GestionSecretarios, GestionUsuarios
- GET /api/usuarios → `index()`  ← GestionSecretarios, GestionUsuarios
- POST /api/usuarios → `store()`  ← GestionSecretarios, GestionUsuarios
### ValidacionController  (usa: Validacion)
- DELETE /api/validaciones/{id} → `destroy()`
- GET /api/validaciones/{id} → `show()`
- PUT /api/validaciones/{id} → `update()`
- GET /api/validaciones → `index()`
- POST /api/validaciones → `store()`
### VersionDocumentoController  (usa: VersionDocumento)
- DELETE /api/versiones-documento/{id} → `destroy()`
- GET /api/versiones-documento/{id} → `show()`
- PUT /api/versiones-documento/{id} → `update()`
- GET /api/versiones-documento → `index()`
- POST /api/versiones-documento → `store()`

## Modelos Eloquent → tabla y relaciones
- **Articulo** (`articulos`): belongsTo Norma; hasMany Regla
- **Auditoria** (`auditoria`): belongsTo Usuario
- **Cargo** (`cargos`): hasMany Oficial
- **ComandoDepartamental** (`comando_departamental`): hasMany Epi
- **Configuracion** (`configuracion`)
- **Documento** (`documentos`): belongsTo TipoDocumento; belongsTo Oficial; belongsTo Usuario; belongsTo Epi; belongsTo EstadoDocumento; hasMany VersionDocumento; hasMany Revision; hasMany Validacion; hasMany FlujoDocumento; hasMany HistorialEstado; hasMany Notificacion
- **Epi** (`epis`): belongsTo ComandoDepartamental; hasMany Usuario; hasMany Oficial; hasMany HistorialDestino; hasMany Documento; hasMany FlujoDocumento
- **EstadoDocumento** (`estados_documento`): hasMany Documento
- **FlujoDocumento** (`flujo_documentos`): belongsTo Documento; belongsTo Usuario
- **Grado** (`grados`): hasMany Oficial
- **HistorialDestino** (`historial_destinos`): belongsTo Oficial; belongsTo Epi
- **HistorialEstado** (`historial_estados`): belongsTo Documento; belongsTo EstadoDocumento; belongsTo Usuario
- **Norma** (`normas`): hasMany Articulo
- **Notificacion** (`notificaciones`): belongsTo Usuario; belongsTo Documento
- **Oficial** (`oficiales`): belongsTo Grado; belongsTo Epi; belongsTo Cargo; hasMany HistorialDestino; hasMany Documento
- **Plantilla** (`plantillas`): belongsTo TipoDocumento
- **RegistroLink** (`links_registro`): belongsTo Rol; belongsTo Epi; belongsTo Usuario; hasMany SolicitudRegistro
- **Regla** (`reglas`): belongsTo Articulo; belongsTo TipoDocumento; hasMany Validacion
- **Revision** (`revisiones`): belongsTo Documento; belongsTo Usuario; belongsTo TipoObservacion
- **Rol** (`roles`): hasMany Usuario
- **Sesion** (`sesiones`): belongsTo Usuario
- **SolicitudRegistro** (`solicitudes_registro`): belongsTo RegistroLink; belongsTo Rol; belongsTo Epi; belongsTo Usuario
- **TipoDocumento** (`tipos_documento`): hasMany Plantilla; hasMany Documento; hasMany Regla
- **TipoMemo** (`tipos_memo`): belongsTo TipoDocumento; belongsTo Usuario
- **TipoObservacion** (`tipos_observacion`): hasMany Revision
- **Usuario** (`usuarios`): belongsTo Rol; belongsTo Epi; hasMany Sesion; hasMany Auditoria; hasMany Plantilla; hasMany Documento; hasMany VersionDocumento; hasMany Revision; hasMany FlujoDocumento; hasMany HistorialEstado; hasMany Notificacion
- **Validacion** (`validaciones`): belongsTo Documento; belongsTo Regla
- **VersionDocumento** (`versiones_documento`): belongsTo Documento; belongsTo Usuario
- **tabla: articulos**
- **tabla: auditoria**
- **tabla: cargos**
- **tabla: comando_departamental**
- **tabla: configuracion**
- **tabla: documentos**
- **tabla: epis**
- **tabla: estados_documento**
- **tabla: flujo_documentos**
- **tabla: grados**
- **tabla: historial_destinos**
- **tabla: historial_estados**
- **tabla: links_registro**
- **tabla: normas**
- **tabla: notificaciones**
- **tabla: oficiales**
- **tabla: plantillas**
- **tabla: reglas**
- **tabla: revisiones**
- **tabla: roles**
- **tabla: sesiones**
- **tabla: solicitudes_registro**
- **tabla: tipos_documento**
- **tabla: tipos_memo**
- **tabla: tipos_observacion**
- **tabla: usuarios**
- **tabla: validaciones**
- **tabla: versiones_documento**

## Servicios (app/Services) → quién los usa
- **ArchivosRegistro** (2 métodos) ← SolicitudRegistroController
- **ColaVerificacionIA** (5 métodos) ← —
- **ConfirmacionEnvio** (4 métodos) ← DocumentoController, SubsanacionDocumento, SugerenciasTipos
- **PdfPaginas** (9 métodos) ← —
- **ReportesInstitucionales** (7 métodos) ← verificar-descargas.php
- **SubsanacionDocumento** (4 métodos) ← verificar-seguridad.php
- **SugerenciasTipos** (2 métodos) ← TipoMemoController
- **VerificacionRegistro** (2 métodos) ← ColaVerificacionIA, SolicitudRegistroController
- **VerificadorIA** (46 métodos) ← DocumentoController, SolicitudRegistroController
- **tabla: decisiones_tipos_libres** (0 métodos) ← —
- **tabla: documentos as d** (0 métodos) ← —
- **tabla: revisiones as r** (0 métodos) ← —

## Librerías frontend más usadas (importadas por)
- `resources/js/lib/api.js` ← 39 archivos
- `resources/js/context/AuthContext.jsx` ← 31 archivos
- `resources/js/components/ui/Alert.jsx` ← 29 archivos
- `resources/js/components/ui/Spinner.jsx` ← 27 archivos
- `resources/js/components/ui/Graficos.jsx` ← 25 archivos
- `resources/js/components/ui/CargandoLista.jsx` ← 18 archivos
- `resources/js/components/LayoutComandoGeneral.jsx` ← 16 archivos
- `resources/js/components/ui/Modal.jsx` ← 15 archivos
- `resources/js/components/ui/EstadoBadge.jsx` ← 13 archivos
- `resources/js/components/LayoutComandoDepartamental.jsx` ← 12 archivos
- `resources/js/components/ui/ToastEnVivo.jsx` ← 12 archivos
- `resources/js/components/LayoutSecretario.jsx` ← 11 archivos
- `resources/js/components/ui/Panel.jsx` ← 11 archivos
- `resources/js/lib/useListaProgresiva.js` ← 7 archivos
- `resources/js/components/ui/MasResultados.jsx` ← 7 archivos
- `resources/js/components/ui/AvatarFoto.jsx` ← 6 archivos
- `resources/js/constants/navegacion.js` ← 5 archivos
- `resources/js/constants/ofbol.js` ← 5 archivos
- `resources/js/components/ui/Escudo.jsx` ← 5 archivos
- `resources/js/components/ui/ConfirmDialog.jsx` ← 5 archivos

## Nodos centrales (god nodes de Graphify) (most connected - your core abstractions)
1. `VerificadorIA` - 54 edges
2. `Documento` - 52 edges
3. `Usuario` - 51 edges
4. `Controller` - 37 edges
5. `Epi` - 29 edges
6. `SolicitudRegistroController` - 29 edges
7. `DocumentoController` - 28 edges
8. `Oficial` - 25 edges
9. `SolicitudRegistro` - 23 edges
10. `TipoDocumento` - 22 edges

## Cambios recientes
### 2026-11-12 · Mejora visual y velocidad (respaldo: `.claude/backups/2026-11-12-mejora-visual/`)
- Diagnóstico: cada petición a Laravel tardaba 550–650 ms porque el servidor del puerto 8000 corría sin OPcache, y atendía las peticiones de una en una. La solución es usar `scripts/iniciar-servidor.ps1 -Port 8000`.
- `GET /api/catalogos` (CatalogoController): devuelve juntos epis, tipos-documento, estados-documento, tipos-observacion, grados, cargos, roles y comando-departamental. `api.js` lo usa al pedir cualquiera de ellos y vuelve a las rutas propias si responde 404.
- `GET /api/documentos?resumen=1` ahora incluye `hash` y `versiones_count`. Las listas de Revisión, Aprobados, Registro, Documentos por EPI, Observaciones, Mis documentos y Subir documento usan resumen; el detalle se pide con `/documentos/{id}`.
- `GET /api/revisiones?sin_documento=1`: no incluye el expediente completo en cada revisión. Lo usa Observaciones, que además calcula la última revisión con un Map.
- Listas largas por tramos de 60 (`useListaProgresiva` + `MasResultados`) en ambos Historiales, Revisión, Aprobados, Registro, Observaciones y Auditoría. Todos los datos siguen accesibles.
- Las cargas de listados muestran el esqueleto `CargandoLista` en vez del spinner (19 pantallas).
- El sondeo del modo en vivo (`useSincronizacion`) cede su turno mientras haya peticiones de pantalla en curso (`api.ocupado()`).
- Dashboard del Comando Departamental reorganizado: la tabla de recientes ocupa todo el ancho y suma la columna Referencia; Cruce por EPI comparte fila con Accesos rápidos; Reglas del dictamen es una franja de 3 columnas. Así no quedan huecos al bajar.
- Dashboard del Comando General: la actividad por unidad muestra las 9 EPIs (antes 7).
- CSS: superficies heredadas alineadas con `.ofbol-card`, ancho de 1440 px en pantallas grandes, celdas de nombre con ancho mínimo, `.ofbol-enlace-accion`, `.ofbol-btn-fila`, hover de accesos rápidos y esqueleto con respiración (respeta reduced-motion).

### 2026-11-12 · Portada y login (respaldo: `.claude/backups/2026-11-12-portada-login/`)
- Portada (`views/inicio/Inicio.jsx`): menos texto (sin la etiqueta superior, descripciones de una línea, características convertidas en chips). Espacios para fotografías reales en cada paso y una galería "Al servicio de La Paz". Las fotos se configuran en `js/components/landing/fotosInicio.js` y se guardan en `public/images/inicio/` (ver LEEME.txt). Si falta una foto, su espacio no aparece.
- Login (`views/login/Login.jsx`): botón "Volver a la página inicial" arriba a la izquierda (`.pb-login-volver` en login-characters.css). Se quitó el enlace "← Página principal" que estaba dentro de la tarjeta.
- Verificado en vivo tras el build: el Panel Departamental quedó sin huecos (Cruce y Accesos a 413 px de alto cada uno; la tabla sin desbordar a 1600 px). Historial: de 27.821 a 1.615 elementos en pantalla.

### 2026-11-12 · Ajuste de tablas detectado al capturar el informe
- `app.css`: las tablas de 8 o más columnas (Cola de Revisión, bandejas) usan celdas de 12 px de relleno horizontal, para que la columna de acciones no quede cortada a 1600 px. Ancho mínimo de las celdas con nombre: 9rem.
- `GestionUsuarios.jsx`: los correos largos pueden partirse (`[overflow-wrap:anywhere]`), para que el botón "Desactivar" no quede fuera de la tabla. Requiere `npm run build`.

## Cómo usar este mapa
- Antes de editar algo, ubica la pantalla → endpoint → controlador → modelo/tabla en este mapa.
- Para detalle, consulta `graphify-out/graph.json` (con Graphify instalado: `graphify query "..."`, `graphify path A B`, `graphify explain X`).
- Si el código cambia mucho, regenera el mapa y vuelve a enviarlo.