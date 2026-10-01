# Eliminación de cuenta

La aplicación invoca la Edge Function autenticada `delete-account`. La función obtiene el usuario desde su sesión, elimina sus registros y después elimina el usuario de Auth. La clave administrativa existe únicamente en el entorno seguro de Supabase y nunca se incluye en la aplicación.

## Despliegue

Desde PowerShell, en la raíz del proyecto:

```powershell
npx supabase login
npx supabase link --project-ref TU_PROJECT_REF
npx supabase functions deploy delete-account
```

Las variables `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` son secretos proporcionados automáticamente por Supabase a sus Edge Functions. No se deben copiar a `.env`, `app.json` ni a ninguna variable `EXPO_PUBLIC_*`.

La función conserva la verificación JWT predeterminada y vuelve a validar al usuario con `auth.getUser()` antes de usar privilegios administrativos. Solo acepta `POST` y exige la confirmación enviada por la interfaz.

## Comprobación manual

1. Crea una cuenta de prueba y añade al menos un gasto, ingreso, presupuesto, categoría y recurrencia.
2. Abre **Ajustes → Cuenta → Eliminar cuenta**.
3. Escribe la palabra de confirmación y elimina la cuenta.
4. Comprueba en Supabase que ya no existe en **Authentication → Users** ni conserva filas en las tablas de la aplicación.
5. Confirma que la app vuelve a la pantalla de acceso y que esas credenciales ya no inician sesión.

La operación es permanente. Haz esta prueba únicamente con una cuenta creada para QA.
