# Lanzamiento a testing cerrado

## Estado técnico preparado

- Nombre visible: `Expense Tracker`.
- Identificador Android: `rld.expensetracker.app`.
- Versión: `1.1.0`.
- Formato de producción: Android App Bundle (`.aab`).
- SDK objetivo: Android 16 / API 36 mediante Expo SDK 57.
- Permisos de producción: acceso a Internet únicamente.
- Copias de seguridad del sistema Android: desactivadas.
- Incremento de versión de Play: automático mediante EAS.

El identificador de aplicación queda fijado en cuanto se crea la aplicación en Play Console. Play Console debe aceptar `rld.expensetracker.app` antes de distribuir la primera versión.

## Antes de construir

Desde PowerShell, en `C:\Users\ruben\ExpenseTracker`:

```powershell
npm install
npx expo-doctor
npx tsc --noEmit
npm test
```

Comprueba también que las variables del entorno `production` de EAS contienen las claves públicas necesarias. No incluyas ninguna clave administrativa en EAS, `.env` o el código móvil.

## Construir el AAB

```powershell
cd C:\Users\ruben\ExpenseTracker
npx eas-cli@latest build --platform android --profile production
```

Descarga el `.aab` desde el enlace que muestra EAS. Para Play Store usa el perfil `production`; el perfil `preview` genera un APK para instalación directa y no es el artefacto de publicación.

## Configuración de Play Console

1. Crear la aplicación como **Expense Tracker**, idioma principal español, tipo aplicación y categoría Finanzas.
2. Completar la ficha con `store-listing-es.md` y subir icono, imagen destacada y capturas.
3. Indicar que no contiene anuncios.
4. Completar Acceso a la aplicación con una cuenta de revisión funcional y sus instrucciones.
5. Completar Público objetivo, Clasificación de contenido y Funciones financieras.
6. Completar Seguridad de los datos siguiendo `data-safety.md`.
7. Añadir la política de privacidad: `https://ruben-lopez-dejuan.github.io/ExpenseTracker-legal/privacy.html`.
8. Añadir la URL de eliminación: `https://ruben-lopez-dejuan.github.io/ExpenseTracker-legal/delete-account.html`.
9. Crear una pista de testing cerrado, subir el AAB y añadir el grupo o lista de testers.
10. Revisar los avisos automáticos, guardar y enviar la versión a revisión.

Las cuentas personales de Play Console creadas después del 13 de noviembre de 2023 deben mantener al menos 12 testers inscritos durante 14 días continuos antes de solicitar acceso a producción.

## Cuenta para la revisión

Crea una cuenta específica para Google Play con el correo ya verificado. Incluye en **Acceso a la aplicación**:

- correo de la cuenta de revisión;
- contraseña;
- indicación de que no hay verificación en dos pasos;
- pasos: abrir la app, iniciar sesión y acceder a Resumen, Gastos, Planificación y Ajustes.

No uses una cuenta personal ni una contraseña reutilizada.

## Prueba rápida de la versión instalada

1. Crear cuenta, verificar el correo e iniciar sesión.
2. Crear, editar y eliminar un gasto y un ingreso.
3. Crear un presupuesto y una recurrencia.
4. Cerrar la conexión, crear un movimiento, recuperar Internet y comprobar la sincronización.
5. Cambiar tema, idioma y divisa.
6. Solicitar la descarga del modelo local y comprobar que la app sigue funcionando si se cancela o falla.
7. Restablecer la contraseña mediante el enlace recibido.
8. Con una cuenta exclusiva de QA, eliminar la cuenta y confirmar que ya no puede iniciar sesión.
9. Reiniciar el teléfono y comprobar icono, splash y navegación inferior.

