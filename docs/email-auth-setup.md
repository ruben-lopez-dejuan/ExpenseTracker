# Registro y recuperación mediante enlaces de correo

La aplicación utiliza los enlaces de confirmación y recuperación predeterminados. Al abrirlos en el móvil, vuelven a la APK mediante `expensetracker://auth-callback`. No hace falta tener una página web ni personalizar las plantillas de correo.

En el proyecto de Supabase:

1. En **Authentication → Providers → Email**, deja el proveedor de correo activo y habilita **Confirm email**.
2. En **Authentication → URL Configuration → Redirect URLs**, añade exactamente `expensetracker://auth-callback`. La app ya envía esta URL al registrar una cuenta y al solicitar el cambio de contraseña. `Site URL` puede conservar su valor actual para este flujo.
3. En **Authentication → Email Templates → Confirm signup** y **Reset password**, conserva las plantillas predeterminadas con `{{ .ConfirmationURL }}`. Si las habías cambiado para mostrar `{{ .Token }}`, restablece el enlace de confirmación en ambas. No es necesario editar los textos.

Para probarlo en una **build de desarrollo**, inicia Metro con `npx expo start --dev-client --clear`, abre manualmente Expense Tracker desde esa build y espera a que cargue el proyecto. **Déjala abierta en segundo plano** mientras abres el correo y pulsas el enlace. Expo no admite el arranque en frío de una build de desarrollo mediante un enlace propio de la app. Si aparece «Unmatched Route», comprueba que estás viendo el proyecto actual dentro de la build de desarrollo, no una APK antigua.

Para probarlo sin Metro, instala una **nueva APK preview** construida después de estos cambios. Una APK anterior no contiene la ruta `auth-callback`. Registra una cuenta nueva, abre el enlace recibido desde ese mismo Android y comprueba que la app inicia sesión. Después cierra sesión, solicita un restablecimiento y abre el segundo enlace: debe aparecer la pantalla para escribir y confirmar la contraseña nueva. Expo Go no ofrece una URL estable con este esquema.

Si el enlace abre una página web o muestra un error de redirección, comprueba que la Redirect URL coincide exactamente con `expensetracker://auth-callback` y que el botón de la plantilla usa `{{ .ConfirmationURL }}`. El servicio de correo incluido en Supabase tiene límites de envío estrictos; para distribuir la app a más usuarios, configura SMTP propio.
