# Graph Report - ofbol  (2026-11-12)

## Corpus Check
- 275 files · ~0 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1080 nodes · 2087 edges · 109 communities (45 shown, 64 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 114 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Servicios (IA, PDF, reportes) · VerificadorIA
- Frontend (app.jsx / contexto) · app.jsx
- Componentes UI · Panel.jsx
- Controladores API · ReportesInstitucionales
- Componentes UI · Alert.jsx
- Componentes UI · DocumentosAprobados.jsx
- Componentes UI · Graficos.jsx
- Servicios (IA, PDF, reportes) · ConfirmacionEnvio
- Vistas Secretario de Unidad (EPI) · api.js
- Controladores API · api.php
- Controladores API · SolicitudRegistroController
- Componentes UI · MEJORAS_REALIZADAS.md
- Controladores API · HistorialEstado
- Controladores API · PlantillaController
- Controladores API · README_FASES_E_IA.md
- Controladores API · FlujoDocumento
- Modelos Eloquent · TipoDocumento
- Controladores API · RegistroLink
- Controladores API · Regla
- Controladores API · UsuarioController
- Layouts y componentes · LayoutComandoGeneral.jsx
- Controladores API · HistorialDestino
- Controladores API · Revision
- Modelos Eloquent · SolicitudRegistro
- Controladores API · Validacion
- Modelos Eloquent · Oficial
- Controladores API · CargoController
- Controladores API · Controller
- Controladores API · ComandoDepartamentalController
- Controladores API · GradoController
- Controladores API · NormaController
- Controladores API · NotificacionController
- Controladores API · RolController
- Controladores API · TipoObservacionController
- Controladores API · ConfiguracionController
- Modelos Eloquent · Documento
- Modelos Eloquent · Usuario
- Controladores API · EstadoDocumentoController
- Controladores API · PanelController
- Controladores API · TipoMemoController
- Controladores API · AuditoriaController
- Controladores API · OficialController
- Controladores API · SesionController
- Servicios (IA, PDF, reportes) · ColaVerificacionIA
- Controladores API · EpiController
- Servicios (IA, PDF, reportes) · PdfPaginas
- Controladores API · Sesion
- Modelos Eloquent · Epi
- Controladores API · MetricasController
- Layouts y componentes · AyudaSistema.jsx
- Vistas Secretario de Unidad (EPI) · Correcciones.jsx
- Scripts de mantenimiento · CargaRegistroPrueba
- Otros · AppServiceProvider
- Base de datos / migraciones · 2026_11_09_000001_confirmacion_envio_y_tipos_libres.php
- Tests · ExampleTest
- Controladores API · useSincronizacion.js
- Middleware / permisos · SecurityHeaders
- Servicios (IA, PDF, reportes) · ArchivosRegistro
- Base de datos / migraciones · UserFactory
- Otros · IaDiagnostico.php
- Middleware / permisos · SesionActiva
- Base de datos / migraciones · DatabaseSeeder
- Componentes UI · Tooltip.jsx
- Tests · ExampleTest
- Vistas públicas / login

## God Nodes (most connected - your core abstractions)
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

## Surprising Connections (you probably didn't know these)
- `GET /api/me` --routes_to--> `AuthController::actual()`  [EXTRACTED]
  routes/api.php → app/Http/Controllers/AuthController.php
- `GET /api/epis` --routes_to--> `EpiController::index()`  [EXTRACTED]
  routes/api.php → app/Http/Controllers/EpiController.php
- `GET /api/tipos-documento` --routes_to--> `TipoDocumentoController::index()`  [EXTRACTED]
  routes/api.php → app/Http/Controllers/TipoDocumentoController.php
- `GET /api/estados-documento` --routes_to--> `EstadoDocumentoController::index()`  [EXTRACTED]
  routes/api.php → app/Http/Controllers/EstadoDocumentoController.php
- `GET /api/documentos` --routes_to--> `DocumentoController::index()`  [EXTRACTED]
  routes/api.php → app/Http/Controllers/DocumentoController.php

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Vistas del rol comando_general** — resources_views_comando_general_historial, resources_views_comando_general_notificaciones, resources_views_comando_general_trazabilidad, resources_views_comando_general_reportes, resources_views_comando_general_auditoria, resources_views_comando_general_directorioinstitucional, resources_views_comando_general_perfil, resources_views_comando_general_documentosaprobados, resources_views_comando_general_registrodocumental, resources_views_comando_general_comparativogeneral, resources_views_comando_general_registrooficialesia, resources_views_comando_general_dashboard, resources_views_comando_general_gestionusuarios, resources_views_comando_general_gestiontiposmemo [EXTRACTED 1.00]
- **Vistas del rol secretario_comando_departamental** — resources_views_secretario_comando_departamental_historial, resources_views_secretario_comando_departamental_notificaciones, resources_views_secretario_comando_departamental_documentosporepi, resources_views_secretario_comando_departamental_trazabilidad, resources_views_secretario_comando_departamental_reportes, resources_views_secretario_comando_departamental_desempenioepis, resources_views_secretario_comando_departamental_perfil, resources_views_secretario_comando_departamental_revisardocumentos, resources_views_secretario_comando_departamental_observaciones, resources_views_secretario_comando_departamental_gestionsecretarios, resources_views_secretario_comando_departamental_dashboard [EXTRACTED 1.00]
- **Vistas del rol secretario_unidad** — resources_views_secretario_unidad_subirdocumento, resources_views_secretario_unidad_misdocumentos, resources_views_secretario_unidad_correcciones, resources_views_secretario_unidad_historial, resources_views_secretario_unidad_notificaciones, resources_views_secretario_unidad_reportes, resources_views_secretario_unidad_perfil, resources_views_secretario_unidad_plantillas, resources_views_secretario_unidad_dashboard, resources_views_secretario_unidad_oficialesepi [EXTRACTED 1.00]

## Communities (109 total, 64 thin omitted)

### Community 1 - "Frontend (app.jsx / contexto) · app.jsx"
Cohesion: 0.07
Nodes (30): ComparativoGeneral, GestionTiposMemo, Reportes, Trazabilidad, RegistroOficial, DesempenioEpis, Reportes, Trazabilidad (+22 more)

### Community 2 - "Componentes UI · Panel.jsx"
Cohesion: 0.05
Nodes (23): AuthController::login(), RedInstitucional3D, CommandPalette, CommandPaletteLauncher, CountUp, Escudo, MenuUsuario, Aparicion (+15 more)

### Community 3 - "Controladores API · ReportesInstitucionales"
Cohesion: 0.06
Nodes (22): ReporteInstitucionalController, ReporteInstitucionalController::exportar(), ReporteInstitucionalController::index(), VersionDocumentoController, VersionDocumentoController::destroy(), VersionDocumentoController::index(), VersionDocumentoController::show(), VersionDocumentoController::store() (+14 more)

### Community 4 - "Componentes UI · Alert.jsx"
Cohesion: 0.10
Nodes (22): Alert, CargandoLista, EstadoBadge, RecorridoInstitucional, Spinner, GestionUsuarios, Historial, RegistroOficialesIA (+14 more)

### Community 5 - "Componentes UI · DocumentosAprobados.jsx"
Cohesion: 0.09
Nodes (21): ConfirmDialog, MasResultados, Modal, ObservacionesRemision, SugerenciasTipos, Auditoria, DocumentosAprobados, RegistroDocumental (+13 more)

### Community 6 - "Componentes UI · Graficos.jsx"
Cohesion: 0.08
Nodes (23): DesempenioEpisPanel, CampusEpis, EdificioEPI, BandaEstados, ChipsDato, ComparativaEntidades, EstadoVacio, FlujoDocumental (+15 more)

### Community 7 - "Servicios (IA, PDF, reportes) · ConfirmacionEnvio"
Cohesion: 0.07
Nodes (13): ConfirmacionEnvioController, ConfirmacionEnvioController::preparar(), ConfirmacionEnvioController::prepararSubsanacion(), ConfirmacionEnvioController::subsanar(), SugerenciaTipoController, SugerenciaTipoController::decidir(), ConfirmacionEnvio, SubsanacionDocumento (+5 more)

### Community 8 - "Vistas Secretario de Unidad (EPI) · api.js"
Cohesion: 0.12
Nodes (16): AuthProvider, Notificaciones, Notificaciones, Notificaciones, OficialesEpi, Reportes, SubirDocumento, GET /api/documentos (+8 more)

### Community 9 - "Controladores API · api.php"
Cohesion: 0.11
Nodes (22): DocumentoController, DocumentoController::archivo(), DocumentoController::archivoPorRuta(), DocumentoController::desempenioEpis(), DocumentoController::destroy(), DocumentoController::estadisticasGenerales(), DocumentoController::index(), DocumentoController::revisarIA() (+14 more)

### Community 10 - "Controladores API · SolicitudRegistroController"
Cohesion: 0.08
Nodes (17): SolicitudRegistroController, SolicitudRegistroController::actualizarAdjuntos(), SolicitudRegistroController::aprobar(), SolicitudRegistroController::archivo(), SolicitudRegistroController::index(), SolicitudRegistroController::rechazar(), SolicitudRegistroController::registrarPublico(), SolicitudRegistroController::show() (+9 more)

### Community 11 - "Componentes UI · MEJORAS_REALIZADAS.md"
Cohesion: 0.11
Nodes (10): AvatarFoto, PerfilInstitucional, DirectorioInstitucional, Perfil, Perfil, Perfil, pantalla /comando-departamental/perfil, pantalla /comando-general/directorio (+2 more)

### Community 12 - "Controladores API · HistorialEstado"
Cohesion: 0.11
Nodes (11): HistorialEstadoController, HistorialEstadoController::destroy(), HistorialEstadoController::index(), HistorialEstadoController::show(), HistorialEstadoController::store(), HistorialEstadoController::update(), HistorialEstado, DELETE /api/historial-estados/{id} (+3 more)

### Community 13 - "Controladores API · PlantillaController"
Cohesion: 0.11
Nodes (15): PlantillaController, PlantillaController::archivo(), PlantillaController::destroy(), PlantillaController::index(), PlantillaController::show(), PlantillaController::store(), PlantillaController::update(), Plantilla (+7 more)

### Community 14 - "Controladores API · README_FASES_E_IA.md"
Cohesion: 0.12
Nodes (13): ArticuloController, ArticuloController::destroy(), ArticuloController::index(), ArticuloController::show(), ArticuloController::store(), ArticuloController::update(), Articulo, tabla: articulos (+5 more)

### Community 15 - "Controladores API · FlujoDocumento"
Cohesion: 0.12
Nodes (13): FlujoDocumentoController, FlujoDocumentoController::destroy(), FlujoDocumentoController::index(), FlujoDocumentoController::show(), FlujoDocumentoController::store(), FlujoDocumentoController::update(), FlujoDocumento, tabla: flujo_documentos (+5 more)

### Community 16 - "Modelos Eloquent · TipoDocumento"
Cohesion: 0.14
Nodes (4): TipoDocumento, TipoMemo, TiposMemoSeeder, tabla: tipos_documento

### Community 17 - "Controladores API · RegistroLink"
Cohesion: 0.12
Nodes (11): RegistroLinkController, RegistroLinkController::cancelar(), RegistroLinkController::index(), RegistroLinkController::publico(), RegistroLinkController::store(), RegistroLink, tabla: links_registro, GET /api/registro-links (+3 more)

### Community 18 - "Controladores API · Regla"
Cohesion: 0.12
Nodes (13): ReglaController, ReglaController::destroy(), ReglaController::index(), ReglaController::show(), ReglaController::store(), ReglaController::update(), Regla, tabla: reglas (+5 more)

### Community 19 - "Controladores API · UsuarioController"
Cohesion: 0.11
Nodes (17): UsuarioController, UsuarioController::destroy(), UsuarioController::foto(), UsuarioController::index(), UsuarioController::resetPassword(), UsuarioController::show(), UsuarioController::store(), UsuarioController::subirFoto() (+9 more)

### Community 20 - "Layouts y componentes · LayoutComandoGeneral.jsx"
Cohesion: 0.18
Nodes (7): InstitutionalShell, LayoutComandoDepartamental, LayoutComandoGeneral, LayoutSecretario, SidebarShell, ScreenSkeleton, ReportesEngine

### Community 21 - "Controladores API · HistorialDestino"
Cohesion: 0.12
Nodes (13): HistorialDestinoController, HistorialDestinoController::destroy(), HistorialDestinoController::index(), HistorialDestinoController::show(), HistorialDestinoController::store(), HistorialDestinoController::update(), HistorialDestino, tabla: historial_destinos (+5 more)

### Community 22 - "Controladores API · Revision"
Cohesion: 0.12
Nodes (12): RevisionController, RevisionController::destroy(), RevisionController::index(), RevisionController::show(), RevisionController::store(), RevisionController::update(), Revision, tabla: revisiones (+4 more)

### Community 23 - "Modelos Eloquent · SolicitudRegistro"
Cohesion: 0.13
Nodes (6): SincronizacionController, SincronizacionController::ping(), SolicitudRegistro, VerificacionRegistro, tabla: solicitudes_registro, GET /api/sync/ping

### Community 24 - "Controladores API · Validacion"
Cohesion: 0.12
Nodes (13): ValidacionController, ValidacionController::destroy(), ValidacionController::index(), ValidacionController::show(), ValidacionController::store(), ValidacionController::update(), Validacion, tabla: validaciones (+5 more)

### Community 25 - "Modelos Eloquent · Oficial"
Cohesion: 0.13
Nodes (5): PermisosInstitucionales, Auditoria, Oficial, tabla: auditoria, tabla: oficiales

### Community 26 - "Controladores API · CargoController"
Cohesion: 0.13
Nodes (13): CargoController, CargoController::destroy(), CargoController::index(), CargoController::show(), CargoController::store(), CargoController::update(), Cargo, tabla: cargos (+5 more)

### Community 27 - "Controladores API · Controller"
Cohesion: 0.13
Nodes (14): CatalogoController, CatalogoController::index(), Controller, TipoDocumentoController, TipoDocumentoController::destroy(), TipoDocumentoController::index(), TipoDocumentoController::show(), TipoDocumentoController::store() (+6 more)

### Community 28 - "Controladores API · ComandoDepartamentalController"
Cohesion: 0.13
Nodes (13): ComandoDepartamentalController, ComandoDepartamentalController::destroy(), ComandoDepartamentalController::index(), ComandoDepartamentalController::show(), ComandoDepartamentalController::store(), ComandoDepartamentalController::update(), ComandoDepartamental, tabla: comando_departamental (+5 more)

### Community 29 - "Controladores API · GradoController"
Cohesion: 0.13
Nodes (13): GradoController, GradoController::destroy(), GradoController::index(), GradoController::show(), GradoController::store(), GradoController::update(), Grado, tabla: grados (+5 more)

### Community 30 - "Controladores API · NormaController"
Cohesion: 0.13
Nodes (13): NormaController, NormaController::destroy(), NormaController::index(), NormaController::show(), NormaController::store(), NormaController::update(), Norma, tabla: normas (+5 more)

### Community 31 - "Controladores API · NotificacionController"
Cohesion: 0.13
Nodes (12): NotificacionController, NotificacionController::destroy(), NotificacionController::index(), NotificacionController::show(), NotificacionController::store(), NotificacionController::update(), Notificacion, tabla: notificaciones (+4 more)

### Community 32 - "Controladores API · RolController"
Cohesion: 0.13
Nodes (13): RolController, RolController::destroy(), RolController::index(), RolController::show(), RolController::store(), RolController::update(), Rol, tabla: roles (+5 more)

### Community 33 - "Controladores API · TipoObservacionController"
Cohesion: 0.13
Nodes (13): TipoObservacionController, TipoObservacionController::destroy(), TipoObservacionController::index(), TipoObservacionController::show(), TipoObservacionController::store(), TipoObservacionController::update(), TipoObservacion, tabla: tipos_observacion (+5 more)

### Community 34 - "Controladores API · ConfiguracionController"
Cohesion: 0.14
Nodes (13): ConfiguracionController, ConfiguracionController::destroy(), ConfiguracionController::index(), ConfiguracionController::show(), ConfiguracionController::store(), ConfiguracionController::update(), Configuracion, tabla: configuracion (+5 more)

### Community 37 - "Controladores API · EstadoDocumentoController"
Cohesion: 0.15
Nodes (11): EstadoDocumentoController, EstadoDocumentoController::destroy(), EstadoDocumentoController::index(), EstadoDocumentoController::show(), EstadoDocumentoController::store(), EstadoDocumentoController::update(), EstadoDocumento, DELETE /api/estados-documento/{id} (+3 more)

### Community 38 - "Controladores API · PanelController"
Cohesion: 0.15
Nodes (7): PanelController, PanelController::departamental(), PanelController::general(), PanelController::unidad(), GET /api/panel/departamental, GET /api/panel/general, GET /api/panel/unidad

### Community 39 - "Controladores API · TipoMemoController"
Cohesion: 0.15
Nodes (11): TipoMemoController, TipoMemoController::destroy(), TipoMemoController::index(), TipoMemoController::show(), TipoMemoController::store(), TipoMemoController::update(), DELETE /api/tipos-memo/{id}, GET /api/tipos-memo (+3 more)

### Community 40 - "Controladores API · AuditoriaController"
Cohesion: 0.17
Nodes (11): AuditoriaController, AuditoriaController::destroy(), AuditoriaController::index(), AuditoriaController::show(), AuditoriaController::store(), AuditoriaController::update(), DELETE /api/auditorias/{id}, GET /api/auditorias (+3 more)

### Community 41 - "Controladores API · OficialController"
Cohesion: 0.17
Nodes (11): OficialController, OficialController::destroy(), OficialController::index(), OficialController::show(), OficialController::store(), OficialController::update(), DELETE /api/oficiales/{id}, GET /api/oficiales (+3 more)

### Community 42 - "Controladores API · SesionController"
Cohesion: 0.17
Nodes (11): SesionController, SesionController::destroy(), SesionController::index(), SesionController::show(), SesionController::store(), SesionController::update(), DELETE /api/sesiones/{id}, GET /api/sesiones (+3 more)

### Community 44 - "Controladores API · EpiController"
Cohesion: 0.18
Nodes (10): EpiController, EpiController::destroy(), EpiController::index(), EpiController::show(), EpiController::store(), EpiController::update(), DELETE /api/epis/{id}, GET /api/epis/{id} (+2 more)

### Community 46 - "Controladores API · Sesion"
Cohesion: 0.25
Nodes (6): AuthController, AuthController::actual(), AuthController::logout(), Sesion, tabla: sesiones, POST /api/logout

### Community 48 - "Controladores API · MetricasController"
Cohesion: 0.25
Nodes (5): MetricasController, MetricasController::reportes(), tabla: documentos as d, tabla: estados_documento, GET /api/metricas/reportes

### Community 50 - "Vistas Secretario de Unidad (EPI) · Correcciones.jsx"
Cohesion: 0.33
Nodes (3): Correcciones, GET /api/documentos/{id}, pantalla /secretario/correcciones

### Community 53 - "Base de datos / migraciones · 2026_11_09_000001_confirmacion_envio_y_tipos_libres.php"
Cohesion: 0.40
Nodes (3): tabla: decisiones_tipos_libres, tabla: documentos, tabla: tipos_memo

## Knowledge Gaps
- **133 isolated node(s):** `LectorRegistroDePrueba`, `tabla: tipos_observacion`, `tabla: flujo_documentos`, `tabla: oficiales`, `tabla: historial_destinos` (+128 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 444 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **64 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Documento` connect `Modelos Eloquent · Documento` to `Controladores API · ReportesInstitucionales`, `Modelos Eloquent · Usuario`, `Controladores API · EstadoDocumentoController`, `Controladores API · HistorialEstado`, `Controladores API · FlujoDocumento`, `Modelos Eloquent · Epi`, `Modelos Eloquent · TipoDocumento`, `Base de datos / migraciones · 2026_11_09_000001_confirmacion_envio_y_tipos_libres.php`, `Controladores API · Revision`, `Controladores API · Validacion`, `Modelos Eloquent · Oficial`, `Controladores API · NotificacionController`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **What connects `LectorRegistroDePrueba`, `tabla: tipos_observacion`, `tabla: flujo_documentos` to the rest of the system?**
  _133 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Servicios (IA, PDF, reportes) · VerificadorIA` be split into smaller, more focused modules?**
  _Cohesion score 0.041666666666666664 - nodes in this community are weakly interconnected._
- **Why does `Usuario` connect `Modelos Eloquent · Usuario` to `Controladores API · RolController`, `Modelos Eloquent · Documento`, `Controladores API · ReportesInstitucionales`, `Controladores API · HistorialEstado`, `Controladores API · PlantillaController`, `Controladores API · Sesion`, `Controladores API · FlujoDocumento`, `Modelos Eloquent · Epi`, `Controladores API · Revision`, `Modelos Eloquent · Oficial`, `Controladores API · NotificacionController`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **Should `Frontend (app.jsx / contexto) · app.jsx` be split into smaller, more focused modules?**
  _Cohesion score 0.0707070707070707 - nodes in this community are weakly interconnected._
- **Why does `Regla` connect `Controladores API · Regla` to `Modelos Eloquent · TipoDocumento`, `Controladores API · Validacion`, `Controladores API · README_FASES_E_IA.md`?**
  _High betweenness centrality (0.004) - this node is a cross-community bridge._
- **Should `Componentes UI · Panel.jsx` be split into smaller, more focused modules?**
  _Cohesion score 0.05121951219512195 - nodes in this community are weakly interconnected._