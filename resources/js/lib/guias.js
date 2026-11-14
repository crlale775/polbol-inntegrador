// Contenido editorial propio de cada pantalla. Nunca obtiene datos ni ejecuta acciones.
const topic = (title, description, selector, match) => ({ title, description, selector, match });
const page = (id, title, summary, topics, tips = []) => ({ id, title, summary, topics, tips });
const button = (title, description, match) => topic(title, description, 'main button, main a', match);
const table = (title, description) => topic(title, description, 'main table');
const search = (description) => topic('Encontrar un registro', description, 'main input[type="search"], main input[aria-label*="Buscar"], main input[aria-label*="BUSCAR"]');
const filters = (description) => topic('Acotar la consulta', description, 'main select');
const scope = {
    secretario: 'su EPI asignada',
    'comando-departamental': 'las estaciones del Comando Departamental',
    'comando-general': 'las dependencias incorporadas al sistema',
};

export const GUIAS = {
    '/': page('inicio-publico', 'Portada institucional', 'Esta portada presenta el recorrido del documento, desde su preparación hasta el seguimiento.', [
        topic('Tu acceso institucional', 'Pulsa Acceso institucional para abrir el login. Si ya tienes una sesión activa, el botón te lleva al espacio de tu rol.', '.pb-inicio-access'),
        topic('Explorar el recorrido', 'Desplázate para conocer cómo se prepara, revisa y registra un trámite. La red 3D es una representación ilustrativa: no muestra expedientes ni cifras reales.', '.pb-inicio-scroll'),
        topic('Conocer las responsabilidades', 'Cada etapa tiene una responsabilidad: preparar en la EPI, revisar en Departamental y dar seguimiento desde General. Desplázate para conocer el proceso.', '#inicio-1'),
        topic('Entrar con tu cuenta', 'Cada cuenta accede a sus responsabilidades: Secretaría EPI, Comando Departamental o Comando General. Los documentos requieren una cuenta autorizada.', '.pb-inicio-primary'),
    ]),
    '/login': page('acceso', 'Acceso institucional', 'Ingrese con la cuenta que le asignó la institución. El sistema abrirá el espacio correspondiente a su rol.', [
        topic('Su usuario institucional', 'Escriba su nombre de usuario. El rol y la EPI se determinan a partir de la cuenta; no necesita elegirlos aquí.', '#login-usuario, input[name="usuario"]'),
        topic('Contraseña y privacidad', 'Introduzca su contraseña. El botón del ojo permite mostrarla temporalmente: compruebe que nadie pueda verla antes de usarlo.', '#login-password'),
        topic('Recordar sesión', 'Use esta opción únicamente en un equipo personal o institucional de uso exclusivo. En un equipo compartido, déjela desactivada y cierre la sesión al terminar.', '#recordar'),
        button('Ingresar al sistema', 'Este botón comprueba las credenciales. Si hay un error, lea el aviso y revise el usuario y la contraseña antes de volver a intentar.', 'Ingresar al sistema'),
    ], ['Si no conoce su cuenta o perdió el acceso, solicite asistencia al administrador institucional. Esta guía no revela ni cambia contraseñas.']),

    '/secretario/dashboard': page('epi-inicio', 'Inicio de mi EPI', 'Priorice la emisión y corrección de los documentos de su estación.', [
        topic('Estado de mi trabajo', 'Los indicadores separan documentos en trámite, observados, aprobados y registrados. Aprobado no significa que el registro oficial ya esté cerrado.', 'main .grid'),
        button('Registrar un nuevo trámite', 'Subir documento abre el formulario de emisión. Allí seleccionará al oficial y el tipo de trámite, adjuntará el PDF y comprobará su recepción.', 'Subir documento'),
        button('Atender las correcciones', 'Revise primero los trámites observados. Lea el motivo, corrija el documento y compruebe la nueva versión antes de reenviarlo.', 'Correcciones'),
        topic('Flujo de mis documentos', 'La composición por estados ayuda a identificar qué parte de la carga sigue en revisión y qué parte ya concluyó.', 'main [role="img"]'),
    ], ['Los totales corresponden a su EPI. Para un análisis con fechas y descargas utilice Reportes.']),

    '/secretario/subir-documento': page('epi-carga', 'Subir y registrar documento', 'Prepare los datos del trámite y su PDF antes de enviarlo al flujo institucional.', [
        topic('Identificar al oficial', 'Busque y seleccione al oficial destinatario. Compruebe su identidad y la unidad antes de continuar; un nombre parecido no es suficiente.', 'main form input'),
        topic('Elegir el tipo de documento', 'Los accesos muestran los tipos habilitados. El selector reúne todo el catálogo vigente. Con Otros puede escribir un nombre específico; tras cinco remisiones, General podrá decidir si lo incorpora.', '#tipo-memo, main [data-guide="tipo-documento"]'),
        topic('Código y referencia', 'Revise el código, la fecha y la referencia. Deben coincidir con el documento adjunto y permitir identificar el trámite sin ambigüedad.', 'main input[aria-label="Ej: MEM-DISC-EPI1-2026-001"]'),
        topic('Adjuntar el PDF', 'Seleccione un PDF legible y completo. La zona de carga informa el resultado; llegar al 100 % de transferencia todavía requiere la confirmación del servidor.', 'main [aria-label="Zona para arrastrar el PDF"]'),
        topic('Comprobar el documento', 'Este panel indica los datos y evidencias que faltan. Con el PDF cargado, ejecute la verificación disponible y lea sus observaciones antes de remitir. La comprobación automática apoya la revisión institucional.', 'main [data-guide="verificacion-documento"]'),
        topic('Confirmar la remisión en 90 segundos', 'Al remitir se abre un resumen con las observaciones pendientes. Puede corregir o continuar marcando la casilla de responsabilidad. La confirmación dura 1 minuto y 30 segundos; al vencer debe generar otra. Remitir no aprueba el documento.', 'main form button[type="submit"]'),
    ], ['Esta guía explica el proceso y no carga, registra ni envía documentos por usted.', 'Si falla la recepción o la verificación, conserve el PDF original y lea el mensaje de error antes de reintentar.']),

    '/secretario/mis-documentos': page('epi-documentos', 'Mis documentos', 'Consulte el avance de los documentos emitidos desde su estación.', [
        search('Busque por código, referencia u oficial. Una búsqueda específica es más útil que recorrer toda la lista.'),
        filters('Combine el tipo, el estado y el criterio de orden para reducir los resultados de su EPI.'),
        table('Leer el estado de cada documento', 'Cada fila identifica el trámite y su estado actual. Use el detalle para comprobar la información antes de tomar una acción.'),
        topic('Detalle y PDF', 'Las acciones de cada fila permiten abrir el detalle, consultar el PDF o descargarlo. Abrir una copia no modifica el estado del trámite.', 'main button[aria-label^="Ver el detalle"], main button[aria-label^="Abrir el PDF"], main a[aria-label^="Abrir el PDF"]'),
    ], ['Un documento observado se atiende en Correcciones; la aprobación y el registro oficial pertenecen a las instancias de mando.']),

    '/secretario/correcciones': page('epi-correcciones', 'Subsanar observaciones', 'Corrija la versión del documento conforme a las instrucciones recibidas.', [
        search('Localice el trámite por código, oficial o tipo.'),
        topic('Leer la observación', 'Abra el trámite y lea el motivo completo. Identifique qué dato o parte del PDF debe corregirse antes de preparar otra versión.', 'main [data-guide="correcciones-lista"], main .grid'),
        button('Abrir la subsanación', 'La acción de subsanar permite adjuntar el PDF corregido. Mantenga la identidad del trámite y compruebe el nuevo archivo.', 'Subsanar'),
        topic('Verificar y reenviar', 'Dentro de la ventana de subsanación revise la nueva versión y sus verificaciones. Reenvíe solo cuando las observaciones hayan sido atendidas; espere la confirmación.', undefined),
    ], ['Reenviar sin cambiar el PDF no resuelve una observación sobre su contenido. Conserve el historial y las versiones del trámite.']),

    '/secretario/oficiales': page('epi-personal', 'Personal de mi EPI', 'Consulte la identidad y situación del personal asociado a su estación.', [
        search('Busque por nombre, cédula, escalafón o cargo. Compruebe que el resultado corresponde a la persona que necesita.'),
        filters('Las categorías y el estado permiten distinguir al personal según la clasificación disponible.'),
        topic('Abrir la ficha del oficial', 'Seleccione la ficha para consultar sus datos completos. Use esta información para identificar al destinatario correcto de un documento.', 'main [data-guide="oficiales-lista"], main .grid'),
    ], ['La consulta de documentos por oficial en Reportes muestra carga documental, no una evaluación del desempeño del funcionario.']),

    '/secretario/historial': page('epi-historial', 'Historial de mi estación', 'Consulte los cambios de estado y las observaciones de los trámites de su EPI.', [
        search('Busque por código, tipo, referencia u observación para localizar un antecedente concreto.'),
        filters('Filtre los movimientos para concentrarse en los estados que necesita revisar.'),
        topic('Interpretar un movimiento', 'Cada evento indica qué cambió y cuándo. El historial conserva los antecedentes; el estado actual se consulta en Mis documentos.', 'main [data-guide="historial-lista"], main .space-y-3, main table'),
    ]),

    '/secretario/plantillas': page('epi-formatos', 'Plantillas oficiales', 'Seleccione el formato que corresponde al documento que va a preparar.', [
        search('Busque el formato por nombre o tipo de documento.'),
        topic('Seleccionar una plantilla', 'Revise el nombre y la categoría. Abra la plantilla para comprobar su estructura y los campos que solicita.', 'main [data-guide="plantillas-lista"], main .grid'),
        topic('Preparar el documento', 'Complete los campos con datos reales y revise el resultado. Después genere su PDF y cárguelo desde Subir documento; consultar una plantilla no registra el trámite.', undefined),
    ], ['Compruebe que el formato y las referencias normativas correspondan al trámite que está realizando.']),

    '/comando-departamental/dashboard': page('departamental-inicio', 'Control departamental', 'Organice la revisión y el seguimiento de las estaciones de su comando.', [
        topic('Priorizar la carga', 'Los indicadores distinguen los pendientes, las observaciones y los aprobados remitidos. Consulte la cola para emitir un dictamen, no solo el total.', 'main .grid'),
        button('Abrir la cola de revisión', 'Revise los documentos recibidos y sus evidencias antes de aprobar, observar o devolver un trámite.', 'Cola de revisión'),
        topic('Explorar las estaciones', 'Seleccione un edificio o cambie a la vista de lista para consultar la carga de una EPI. La altura representa volumen, no desempeño profesional.', '.ofbol-campus-panel'),
        topic('Seguir los estados', 'Las gráficas muestran dónde se concentra la carga. Para comparar períodos y descargar resultados utilice Reportes y Cifras.', 'main [role="img"]'),
    ]),

    '/comando-departamental/revision': page('departamental-revision', 'Cola de revisión', 'Examine el PDF y los datos antes de emitir el dictamen departamental.', [
        topic('Elegir la cola de trabajo', 'Las pestañas separan los estados del proceso. Cambiar de pestaña consulta otra cola; no modifica documentos.', 'main [role="tablist"]'),
        search('Localice un memorándum por código, oficial, cédula o EPI.'),
        filters('Acote por estación, tipo y fecha antes de seleccionar un documento.'),
        table('Abrir un expediente', 'Desde las acciones de la fila abra el detalle. Contraste la identidad, el tipo de trámite, el PDF y los antecedentes.'),
        topic('Emitir un dictamen fundamentado', 'En el detalle puede aprobar o registrar una observación/devolución según corresponda. Explique con precisión qué debe corregir la EPI y confirme únicamente después de revisar.', undefined),
    ], ['La guía no aprueba ni devuelve trámites. Los botones del recorrido solo cambian las explicaciones.']),

    '/comando-departamental/observaciones': page('departamental-observaciones', 'Observados y devueltos', 'Dé seguimiento a los trámites remitidos a las EPIs para su subsanación.', [
        search('Busque el documento por cédula, oficial, código o estación.'),
        filters('Seleccione una EPI para revisar las observaciones pendientes de esa dependencia.'),
        table('Consultar el motivo', 'Abra el detalle para leer el motivo y los antecedentes. Distinga una observación de una devolución y compruebe las versiones disponibles.'),
    ], ['Una nueva versión necesita una nueva revisión; el hecho de adjuntarla no equivale a una aprobación.']),

    '/comando-departamental/documentos-epi': page('departamental-campus', 'Campus policial', 'Explore la carga documental de cada estación del comando.', [
        topic('Elegir una estación', 'Los edificios y la lista permiten seleccionar una EPI. Busque la estación y compare su volumen y sus estados.', '.ofbol-campus-panel'),
        topic('Leer la selección', 'Al seleccionar una estación se muestra su detalle y los trámites asociados. Confirme el nombre de la EPI antes de consultar un documento.', 'main [data-guide="epi-detalle"], main h2'),
        search('Dentro de la EPI seleccionada busque por código de memorándum, oficial o tipo.'),
        table('Inspeccionar sus trámites', 'Las filas muestran los documentos de la estación seleccionada. La acción de inspección abre el expediente sin cambiar su estado.'),
    ]),

    '/comando-departamental/secretarios': page('departamental-secretarios', 'Secretarios de unidad', 'Administre las cuentas de Secretaría EPI y su asignación a las estaciones.', [
        table('Comprobar las asignaciones', 'Revise el usuario, la EPI y el estado de la cuenta. Una asignación incorrecta cambia el ámbito en el que trabajará la persona.'),
        button('Crear una cuenta de secretaría', 'Abra el formulario, complete los datos y asigne la EPI correcta. Revise la información antes de guardar.', 'Nuevo'),
        topic('Editar o restablecer acceso', 'Las acciones de cada fila permiten gestionar la cuenta. Restablecer una contraseña o cambiar su estado es una operación real: hágalo solo cuando corresponda y comunique el acceso por el canal institucional.', 'main button[aria-label^="Editar"], main button[aria-label^="Restablecer"]'),
    ]),

    '/comando-general/dashboard': page('general-inicio', 'Supervisión general', 'Supervise el cierre oficial y la distribución institucional de los trámites.', [
        topic('Distinguir validación y registro', 'Por validar reúne documentos preparados para la instancia general. Registrado indica el cierre oficial del flujo; son etapas distintas.', 'main .grid'),
        button('Abrir la bandeja de validación', 'Consulte los expedientes remitidos y revise su contenido antes de cerrar el registro o devolverlos.', 'Bandeja de validación'),
        topic('Explorar el campus', 'Seleccione una estación para conocer su carga. Los indicadores se limitan a las dependencias incorporadas al sistema.', '.ofbol-campus-panel'),
        topic('Analizar el flujo institucional', 'Revise volumen y estados. Para analizar fechas, registro y evidencia con archivos descargables abra Reportes y Cifras.', 'main [role="img"]'),
    ]),

    '/comando-general/documentos': page('general-validacion', 'Bandeja de validación', 'Revise los documentos remitidos para su validación final y registro oficial.', [
        topic('Filtrar por categoría', 'Cambie la categoría para concentrarse en el tipo de trámite que necesita validar.', 'main [aria-label="Filtrar por categoría de trámite"]'),
        search('Busque por código, referencia, oficial o cédula y compruebe la EPI de origen.'),
        filters('El filtro de EPI reduce la bandeja a una estación del sistema.'),
        table('Examinar el expediente', 'Abra el documento desde su fila. Contraste el PDF con los datos del oficial y los antecedentes de revisión.'),
        topic('Cerrar el registro o devolver', 'Dentro del detalle, revise las condiciones de validación y confirme la acción correspondiente. Una devolución debe indicar claramente qué se debe subsanar.', undefined),
    ], ['Esta ayuda no valida documentos ni cambia estados por sí misma.']),

    '/comando-general/registro': page('general-registro', 'Registro documental oficial', 'Consulte los documentos y sus datos de registro en la instancia general.', [
        search('Encuentre un documento por memorándum, oficial o cédula.'),
        filters('Combine EPI, tipo y estado para delimitar la consulta.'),
        table('Consultar el asiento documental', 'Revise el código, los datos del oficial, el estado y las referencias del trámite. Abra el detalle para comprobar el documento asociado.'),
    ], ['La consulta y descarga de un documento no generan un nuevo asiento ni sustituyen la confirmación de registro.']),

    '/comando-general/directorio': page('general-directorio', 'Directorio policial', 'Consulte la identidad y adscripción del personal registrado en el sistema.', [
        search('Busque por nombres, cédula o escalafón. Confirme la coincidencia antes de usar los datos.'),
        filters('Acote el directorio con las categorías y dependencias disponibles.'),
        topic('Ficha institucional', 'Abra la ficha del oficial para consultar la información completa. La fotografía ayuda a identificarlo y complementa los datos documentales.', 'main [data-guide="directorio-lista"], main .grid, main table'),
    ], ['Use los datos del directorio únicamente para las funciones institucionales autorizadas.']),

    '/comando-general/usuarios': page('general-usuarios', 'Gestión de usuarios', 'Administre las cuentas y sus permisos según la responsabilidad institucional.', [
        topic('Filtrar por rol', 'Distinga Secretaría EPI, Comando Departamental y Comando General. El rol determina las acciones y el ámbito de acceso.', 'main [aria-label="Filtrar por rol institucional"]'),
        search('Busque por usuario, correo, rol o EPI para identificar la cuenta correcta.'),
        table('Revisar cuenta y asignación', 'Compruebe el rol, la unidad y el estado antes de modificar una cuenta. La asignación de una EPI debe corresponder al usuario.'),
        button('Crear un usuario', 'Complete el formulario y revise los permisos antes de guardar. Evite otorgar funciones de mando a una cuenta que solo necesita operar su EPI.', 'Nuevo'),
        topic('Restablecer o cambiar el estado', 'Las acciones de cada fila afectan el acceso real. Verifique a qué persona pertenece la cuenta antes de restablecer la contraseña o habilitar/deshabilitarla.', 'main button[aria-label^="Editar la cuenta"]'),
    ]),

    '/comando-general/tipos-memo': page('general-tipos', 'Tipos de memorándum', 'Configure los formatos, campos y criterios de los tipos documentales.', [
        topic('Decidir sobre las sugerencias de uso', 'Los nombres escritos en Otros se sugieren tras cinco remisiones reales. Revise, ajuste el nombre y confirme si desea incorporarlos al catálogo y a los accesos directos. Si los rechaza, solo vuelven a sugerirse tras cinco usos adicionales.', '[data-guide="sugerencias-tipos"]'),
        topic('Consultar los formatos', 'Cada tarjeta identifica un tipo y su configuración. Revise el contenido antes de editar para mantener coherencia con los documentos emitidos.', 'main [data-guide="tipos-lista"], main .grid'),
        button('Agregar un formato', 'Defina el nombre, el código y los campos que necesita el trámite. Compruebe la estructura antes de confirmar su creación.', 'Nuevo'),
        topic('Editar con cuidado', 'La edición afecta la configuración del tipo. Revise sus secciones y las comprobaciones disponibles; confirme solo cuando el formato sea correcto.', 'main button[aria-label^="Editar"]'),
        topic('Eliminar un tipo', 'Compruebe su uso antes de solicitar la eliminación. Lea la confirmación y no confunda retirar un formato con borrar los documentos ya emitidos.', 'main button[aria-label^="Eliminar"]'),
    ]),

    '/comando-general/registro-oficiales': page('general-registro-ia', 'Registro de oficiales con IA', 'Gestione enlaces de registro, solicitudes recibidas y sus verificaciones.', [
        button('Generar un enlace', 'Configure el rol y la EPI del destinatario antes de crear el enlace. Compártalo únicamente con la persona autorizada por el canal institucional.', 'Generar'),
        topic('Revisar los enlaces', 'Los enlaces muestran su estado y solicitudes. Copiar un enlace no envía un mensaje; cancelar uno afecta su disponibilidad.', 'main [data-guide="registro-enlaces"], main h3'),
        table('Interpretar la cola y la IA', 'Revise el estado de la solicitud y de la IA por separado. Recibida o pendiente no significa verificada; lea las advertencias y contraste el memorándum y la fotografía.'),
        topic('Comprobar la identidad', 'Abra una solicitud y examine sus evidencias antes de gestionar su cuenta. Una detección automática es un apoyo y necesita revisión de sus resultados.', undefined),
    ], ['El recorrido no genera enlaces, no envía mensajes y no habilita cuentas automáticamente.']),

    '/comando-general/auditoria': page('general-auditoria', 'Registro de actividad', 'Consulte quién realizó una acción y cuándo ocurrió en el sistema.', [
        search('Busque por usuario, acción o módulo para localizar una operación concreta.'),
        filters('Combine instancia, acción y EPI para delimitar la actividad que desea revisar.'),
        table('Leer el evento de auditoría', 'Compruebe la fecha, el usuario, la acción y el recurso. La auditoría describe operaciones del sistema; el historial del documento explica sus cambios de estado.'),
    ], ['Evite interpretar un evento aislado sin revisar su contexto y los antecedentes del trámite.']),

    '/comando-general/copias-seguridad': page('general-copias', 'Copias de seguridad', 'Guarde una copia de toda la información del sistema y vuelva a ella si algo sale mal.', [
        button('Guardar una copia', 'Escriba una nota breve para reconocerla después y guarde la copia. Se le pedirá su contraseña. El sistema sigue funcionando mientras se guarda.', 'Guardar copia'),
        table('Leer la lista de copias', 'Cada fila indica cuándo se guardó, quién lo hizo y cuántos registros contiene. Las copias automáticas se crean justo antes de una recuperación.'),
        button('Recuperar una copia', 'Recuperar reemplaza toda la información actual por la de esa copia. Se pide su contraseña y antes se guarda el estado actual.', 'Recuperar'),
        button('Descargar una copia', 'Descargue el archivo SQL para conservarlo fuera del servidor, por ejemplo en una unidad externa institucional. Se puede abrir con pgAdmin.', 'Descargar'),
    ], ['El recorrido no guarda, recupera ni elimina copias.', 'Las copias no incluyen los archivos PDF ni las fotografías.']),
};

// Módulos comunes con instrucciones ajustadas a la responsabilidad de cada rol.
for (const base of Object.keys(scope)) {
    const level = base === 'secretario' ? 'EPI' : base === 'comando-departamental' ? 'Departamental' : 'General';
    GUIAS[`/${base}/notificaciones`] = page(`${base}-avisos`, `Notificaciones · ${level}`, `Consulte los avisos relacionados con ${scope[base]}.`, [
        search('Busque palabras del aviso para encontrar el trámite o la novedad que necesita.'),
        topic('Distinguir pendientes de lectura', 'Los avisos sin leer requieren atención. Leer una notificación no aprueba ni corrige el documento relacionado.', 'main [role="tablist"], main [role="group"], main .grid'),
        topic('Abrir el aviso', 'Lea el mensaje completo y use su acceso al trámite cuando esté disponible. Compruebe el estado en el módulo correspondiente antes de actuar.', 'main [data-guide="avisos-lista"], main .space-y-3'),
    ]);
    GUIAS[`/${base}/perfil`] = page(`${base}-perfil`, `Mi perfil · ${level}`, `Compruebe su cuenta institucional y su responsabilidad sobre ${scope[base]}.`, [
        topic('Identidad y función', 'Compruebe el usuario, rol y unidad que muestra su ficha. Si la asignación no corresponde, contacte al administrador.', 'main [data-guide="perfil-ficha"]'),
        topic('Fotografía de perfil', 'La fotografía ayuda a reconocer al usuario. Si esta cuenta permite cambiarla, seleccione una imagen clara y espere la confirmación de carga.', 'main [aria-label="Cambiar foto de perfil"], main img'),
        topic('Uso responsable de la cuenta', 'La cuenta es personal. No comparta sus credenciales y cierre la sesión al terminar, especialmente en equipos compartidos.', undefined),
    ]);
}

for (const base of ['comando-departamental','comando-general']) {
    const general = base === 'comando-general';
    GUIAS[`/${base}/historial`] = page(`${base}-historial`, general ? 'Historial general' : 'Historial departamental', `Examine antecedentes y cambios de los documentos de ${scope[base]}.`, [
        search('Localice el trámite por sus datos de identificación antes de revisar sus antecedentes.'),
        filters('Reduzca la consulta con las dependencias, estados o categorías disponibles.'),
        topic('Leer el recorrido', general ? 'Siga el avance desde la emisión hasta el registro oficial. Consulte los antecedentes de devolución antes de interpretar el estado actual.' : 'Distinga los movimientos de la EPI, los dictámenes departamentales y la remisión a la instancia general.', 'main [data-guide="historial-lista"], main table, main [role="img"], main .space-y-3'),
    ]);
    GUIAS[`/${base}/trazabilidad`] = page(`${base}-traza`, 'Recorrido del trámite', general ? 'Reconstruya el flujo institucional y las evidencias de cada etapa.' : 'Siga las revisiones y el avance de los trámites de su comando.', [
        search('Busque el trámite para seleccionar el expediente que necesita analizar.'),
        filters('Filtre por EPI o estado para limitar la lista de recorridos.'),
        topic('Etapas y responsables', 'La línea de recorrido muestra los hitos disponibles. Abra un trámite para consultar fechas, observaciones y antecedentes.', 'main [data-guide="recorrido-etapas"], main [role="img"], main h2'),
        topic('Examinar la evidencia', 'Distinga estados, revisiones y versiones. La presencia de metadatos no sustituye la lectura y comprobación del archivo original.', 'main [data-guide="recorrido-eventos"], main [aria-label*="Ordenar"]'),
    ]);
    GUIAS[`/${base}/${general ? 'comparativo' : 'desempenio'}`] = page(`${base}-desempenio`, general ? 'Desempeño de EPIs' : 'Desempeño y estadísticas', general ? 'Compare el avance documental de las estaciones incorporadas al sistema.' : 'Detecte diferencias de carga y seguimiento entre las EPIs de su comando.', [
        topic('Cambiar el criterio', 'El criterio de orden cambia la lectura del comparativo. Revise si está observando volumen, registrados o efectividad antes de comparar estaciones.', 'main select, main [role="group"]'),
        topic('Explorar las estaciones', 'Seleccione un edificio o una fila para ver los datos de una EPI. La altura representa volumen de documentos.', '.ofbol-campus-panel'),
        topic('Leer el detalle', 'El detalle explica los estados y cifras de la estación elegida. Una tasa documental no equivale por sí sola al desempeño profesional de su personal.', '#desempenio-detalle'),
        table('Comparar cifras', 'Use las cifras y sus etiquetas conjuntamente; para descargar análisis específicos de su rol abra Reportes y Cifras.'),
    ]);
}

for (const base of Object.keys(scope)) {
    const epi = base === 'secretario';
    const general = base === 'comando-general';
    const focus = epi ? 'pendientes propios, emisión y documentos por oficial' : general ? 'registro oficial, tendencias y evidencia de trazabilidad' : 'comparación de estaciones, dictámenes y antigüedad';
    GUIAS[`/${base}/reportes`] = page(`${base}-reportes`, 'Reportes de mi responsabilidad', `Sus reportes analizan ${focus}.`, [
        topic('Aplicar el período y el ámbito', epi ? 'Seleccione las fechas y pulse Aplicar filtros. La consulta se limita a su EPI.' : 'Seleccione fechas y, si lo necesita, una EPI del ámbito autorizado. Pulse Aplicar filtros para actualizar las cifras.', '.report-filters'),
        topic('Elegir el análisis', `Cada pestaña responde a una pregunta distinta: ${focus}. Cambiar de reporte conserva los filtros aplicados.`, '.report-tabs'),
        topic('Interpretar las gráficas', 'Revise el título, la leyenda y el corte. El botón Datos muestra los valores de la gráfica en una tabla que puede ordenar.', '.report-charts'),
        topic('Consultar todo el detalle', 'Ordene las columnas y avance entre páginas. La descarga incluye todos los registros del análisis, no solo las filas visibles.', '.report-tables'),
        topic('Descargar PDF o Excel', 'El PDF incluye gráficas y detalle. El Excel contiene gráficas nativas que puede editar en la copia descargada desde la hoja Datos gráficas. Ambos conservan los filtros y el corte.', '.report-downloads'),
        topic('Criterios de lectura', general ? 'La evidencia de trazabilidad verifica metadatos registrados; no recalcula el contenido del PDF. La cobertura se limita a las dependencias del sistema.' : epi ? 'Los estados son los del corte; la antigüedad cuenta días calendario y no declara un plazo legal vencido.' : 'El análisis de dictámenes usa la fecha de revisión y cuenta dictámenes, no documentos únicos. Las bandas de antigüedad no son plazos legales.', '.report-method'),
    ], ['Si la descarga avisa que el reporte caducó, pulse Actualizar y vuelva a descargar. Cambiar valores en Excel no modifica los registros del sistema.']);
}

const PUBLIC_REGISTRATION = page('registro-publico', 'Completar mi registro', 'Este enlace permite entregar su información y evidencias para una revisión institucional.', [
    topic('Datos de identidad', 'Complete nombres, apellidos, cédula y teléfono tal como figuran en sus documentos. Revise cada campo antes de enviar.', '#reg-nombres'),
    topic('Datos de acceso', 'Revise el usuario y la contraseña solicitados. Conserve sus credenciales de forma privada; el envío queda sujeto al proceso de revisión.', '#reg-usuario'),
    topic('Fotografía de perfil', 'Seleccione una fotografía clara de su rostro en el formato y tamaño permitidos por el formulario.', 'label[for="reg-foto"], #reg-foto'),
    topic('Memorándum de respaldo', 'Adjunte el PDF de su memorándum legible y completo. La IA comprueba evidencias, pero una solicitud recibida todavía puede necesitar revisión.', 'label[for="reg-memo"], #reg-memo'),
    topic('Enviar una sola vez', 'Compruebe los datos y archivos antes de enviar. Espere la confirmación y lea el estado informado; no cierre mientras se está transfiriendo un archivo.', 'button[type="submit"]'),
], ['Si el enlace expiró o fue cancelado, solicite uno nuevo a la persona que se lo proporcionó. La ayuda no reactiva enlaces.']);

export const guiaNavegacion = page('navegacion-institucional', 'Moverme por el sistema', 'Conozca los accesos comunes de su espacio de trabajo.', [
    topic('Módulos de mi rol', 'El menú reúne las funciones de su cuenta. En móvil, abra el botón de menú de la cabecera; seleccionar un módulo lleva a su pantalla.', '.ofbol-shell-nav, button[aria-label="Abrir menú de módulos"]'),
    topic('Búsqueda rápida', 'Busque un módulo por su nombre. Puede abrir esta búsqueda con el botón de la cabecera o con Ctrl + K.', '.ofbol-shell-search'),
    topic('Notificaciones', 'La campana abre los avisos de su cuenta. Los avisos indican novedades; lea su contenido y consulte el trámite antes de actuar.', '.ofbol-shell-bell'),
    topic('Mi cuenta y cierre de sesión', 'El menú de usuario permite consultar su perfil. Use Cerrar sesión al terminar, especialmente si comparte el equipo.', 'header button[aria-label^="Menú de"]'),
]);

export function guiaDeRuta(pathname) {
    const path = (pathname.replace(/\/$/, '') || '/').replace(/^\/secretario-unidad\//, '/secretario/');
    if (path.startsWith('/registro-oficial/')) return PUBLIC_REGISTRATION;
    if (path === '/comando-departamental/estadisticas') return GUIAS['/comando-departamental/desempenio'];
    return GUIAS[path] ?? null;
}

export function elementoVisible(element) {
    if (!element || element.closest('[inert], [aria-hidden="true"], [data-guide-panel]')) return false;
    const style = getComputedStyle(element);
    return style.visibility !== 'hidden' && style.display !== 'none' && element.getClientRects().length > 0;
}

export function objetivoDeTema(tema, root = document) {
    if (!tema.selector) return undefined;
    return [...root.querySelectorAll(tema.selector)].find(el => elementoVisible(el) && (!tema.match || el.textContent.toLocaleLowerCase('es').includes(tema.match.toLocaleLowerCase('es'))));
}

export function dialogoActual() {
    return [...document.querySelectorAll('[role="dialog"], [aria-modal="true"]')].filter(elementoVisible).at(-1);
}

export function guiaDeDialogo(base, dialog) {
    if (!dialog) return base;
    const heading = dialog.querySelector('h1,h2,h3');
    const title = heading?.textContent?.trim() || 'Detalle del módulo';
    const fields = [...dialog.querySelectorAll('input:not([type="hidden"]), select, textarea')].filter(elementoVisible).slice(0, 12);
    const topics = fields.map((field, i) => {
        const label = (field.labels?.[0]?.textContent?.trim() || field.getAttribute('aria-label') || `Campo ${i + 1}`).slice(0, 120);
        const description = field.type === 'password' ? 'Use una contraseña privada y confirme a qué cuenta corresponde. La guía no guarda ni modifica este valor.'
            : field.type === 'file' ? 'Seleccione el archivo solicitado y compruebe los requisitos visibles. Espere la confirmación antes de cerrar la ventana.'
            : /rol/i.test(label) ? 'El rol determina las funciones y el ámbito de acceso. Asigne únicamente la responsabilidad que necesita esta persona y revísela antes de guardar.'
            : /EPI|unidad|estación/i.test(label) ? 'Seleccione la estación que realmente corresponde al usuario o al trámite. La asignación debe coincidir con la adscripción institucional.'
            : /usuario/i.test(label) ? 'Revise el identificador de acceso de la cuenta. Debe permitir distinguir a esta persona y cumplir las restricciones que indique el formulario.'
            : /correo/i.test(label) ? 'Indique un correo válido y compruebe que corresponde al titular de la cuenta.'
            : /código|codigo/i.test(label) ? 'Compruebe el identificador del documento o formato. Debe coincidir con su respaldo y respetar el patrón solicitado.'
            : /fecha/i.test(label) ? 'Seleccione la fecha que consta en el documento o evento. Compruebe el día, el mes y el año antes de confirmar.'
            : /nombre|apellido|cédula|escalafón/i.test(label) ? 'Compruebe este dato con la identidad y el respaldo documental de la persona. Evite abreviaturas o datos de otra cuenta.'
            : /tipo|formato/i.test(label) ? 'Elija la clasificación que corresponde al documento; de ella dependen el formato y las comprobaciones aplicables.'
            : field.tagName === 'TEXTAREA' ? 'Escriba una explicación precisa y útil para el destinatario. Revise su contenido antes de confirmar.'
            : field.tagName === 'SELECT' ? 'Seleccione la opción que corresponde al trámite o la cuenta. Compruebe sus efectos antes de guardar.'
            : 'Complete o compruebe este dato de acuerdo con el expediente. Los cambios solo se aplican al confirmar la operación.';
        return { ...topic(label, description), element: field };
    });
    const actions = [...dialog.querySelectorAll('button')].filter(el => elementoVisible(el) && /aprobar|devolver|observar|registrar|guardar|eliminar|restablecer|reenviar/i.test(el.textContent)).slice(-6).map(el => {
        const label = el.textContent.trim().slice(0, 100);
        const description = /eliminar/i.test(label) ? 'Esta acción solicita una eliminación real. Compruebe el elemento y lea las condiciones de confirmación antes de continuar.'
            : /devolver|observar/i.test(label) ? 'Indique un motivo concreto y las correcciones necesarias. Revise el expediente antes de confirmar el dictamen.'
            : /aprobar|registrar/i.test(label) ? 'Compruebe el PDF, la identidad y los antecedentes antes de confirmar. Esta decisión modifica el estado del trámite.'
            : /restablecer/i.test(label) ? 'Compruebe la cuenta y la identidad de su titular. La acción cambia el acceso real, por lo que necesita revisar los datos antes de confirmar.'
            : 'Revise los datos y las evidencias antes de confirmar. Espere el mensaje del servidor y evite repetir la operación mientras se procesa.';
        return { ...topic(label, description), element: el };
    });
    const pdf = [...dialog.querySelectorAll('iframe')].find(elementoVisible);
    return page(`${base.id}-detalle`, title, `Ayuda del detalle abierto en ${base.title}.`, [
        { ...topic('Comprobar el expediente', 'Revise la identidad, los datos y las evidencias antes de tomar una decisión. Puede cerrar esta guía en cualquier momento.'), element: heading },
        ...topics,
        ...(pdf ? [{ ...topic('Consultar el PDF', 'Lea el documento completo y contraste su contenido con el expediente. Si su navegador no muestra el visor, utilice Descargar PDF Original o Descargar antes de decidir.'), element: pdf }] : []),
        ...actions,
        topic('Confirmar conscientemente', 'Lea el texto del botón de confirmación. Guardar, aprobar, devolver, eliminar o restablecer son acciones reales. Este recorrido no las ejecuta ni las confirma.', undefined),
    ], ['Para volver a la guía de la pantalla, cierre primero el detalle.']);
}
