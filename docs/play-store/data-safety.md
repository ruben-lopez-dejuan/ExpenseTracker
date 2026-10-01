# Declaración de seguridad de los datos

Esta guía refleja el comportamiento actual de la aplicación. Revísala de nuevo si se añaden analítica, publicidad, informes de errores, conexión bancaria o nuevos proveedores.

## Resumen propuesto

- La aplicación recopila datos: **Sí**.
- La aplicación comparte datos con terceros para sus propios fines: **No**.
- Los datos se cifran durante el tránsito: **Sí**.
- El usuario puede solicitar la eliminación de sus datos: **Sí**, desde Ajustes y mediante la página pública de eliminación.

## Tipos de datos

### Información personal — Dirección de correo electrónico

- Recopilada: sí.
- Obligatoria: sí, para crear y proteger la cuenta.
- Finalidad: gestión de cuenta, autenticación, verificación del correo y recuperación de contraseña.
- Tratamiento: se almacena en el proveedor de autenticación y no se vende ni se usa para publicidad.

### Información financiera — Otra información financiera

Incluye gastos, ingresos, importes, divisas, categorías, presupuestos, movimientos previstos y recurrencias introducidos por el usuario.

- Recopilada: sí.
- Obligatoria: el usuario decide qué movimientos guardar; la cuenta puede existir sin introducir movimientos.
- Finalidad: funcionalidad principal de la aplicación y sincronización entre sesiones.
- Tratamiento: se almacena asociada a la cuenta y las reglas de acceso limitan cada registro a su propietario.

### Actividad en la aplicación — Interacciones con la aplicación

No se recopila con fines analíticos. Las preferencias necesarias para el funcionamiento —idioma, tema, divisa y modo de planificación— se guardan para ofrecer la configuración elegida. Si Play Console obliga a clasificarlas, declara **Funcionalidad de la aplicación** y **Gestión de cuenta**.

## Datos locales

La aplicación conserva una copia local de los datos y una cola de cambios para funcionar sin conexión. El modelo opcional de categorización se descarga únicamente cuando el usuario lo solicita y procesa el texto en el dispositivo. Estos datos no se utilizan para publicidad ni elaboración de perfiles.

## Proveedor de infraestructura

La aplicación usa Supabase como encargado del tratamiento para autenticación, base de datos y sincronización. En la ficha de seguridad de datos, el envío necesario a un proveedor que procesa la información en nombre de la aplicación se declara como recopilación, no como uso compartido para fines propios del proveedor.

## Comprobación antes de enviar

1. Confirmar que no se ha añadido ningún SDK de analítica, publicidad o diagnóstico.
2. Publicar una política de privacidad accesible mediante HTTPS.
3. Publicar una página independiente para solicitar la eliminación de la cuenta.
4. Comprobar que ambas URL permanecen activas y son públicas.

