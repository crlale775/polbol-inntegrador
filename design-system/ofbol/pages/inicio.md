# Portada institucional

Extiende MASTER.md únicamente en `/`. Adaptación del prototipo 3D aportado por el usuario.

- Verde nocturno #07150e, texto #f0f4ec, acento dorado tenue #d6c486; escudo oficial y fuentes del sistema.
- Cuatro escenas: presentación, preparación EPI, revisión departamental y registro/seguimiento General.
- La escena representa nueve EPIs del sistema. No contiene contadores simulados presentados como datos reales.
- Un acceso principal al login, con transición institucional breve que termina al estar disponible la pantalla.
- Three.js se descarga solo en portada; animación sincronizada con el refresco del navegador, sin límite fijo de 30 fps. Geometría estática agrupada, DPR adaptativo, suspensión automática al ocultar la pestaña y liberación al salir.
- Ahorro de datos: ilustración SVG sin descargar Three.js. Movimiento reducido: escena estática; controles y contenido permanecen operativos.
- Controles de al menos 44 px, foco visible, navegación por teclado, texto independiente del canvas y sin desbordamiento móvil.
- Capi abre el recorrido directamente mediante un botón circular con «¿Te ayudo?» encima. No se muestran controles de pausa o silencio en la portada, el acceso o las guías.
