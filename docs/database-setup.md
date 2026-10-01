# Esquema de base de datos y RLS

Las migraciones de `supabase/migrations` describen todas las tablas que utiliza la aplicación. Se pueden aplicar a un proyecto nuevo o a la base existente.

Desde PowerShell:

```powershell
npx supabase login
npx supabase link --project-ref TU_PROJECT_REF
npx supabase db push
```

Para reconstruir una base local vacía con Docker y Supabase CLI:

```powershell
npx supabase start
npx supabase db reset
```

El esquema activa RLS y define políticas separadas para `select`, `insert`, `update` y `delete`. Cada política exige que `auth.uid()` coincida con `user_id`. Las claves foráneas compuestas impiden asociar un gasto, presupuesto o recurrencia con categorías o reglas pertenecientes a otro usuario.

## Comprobación de aislamiento

Después de aplicar las migraciones, crea dos usuarios de QA. Con el token del usuario A verifica que:

- solo lee filas cuyo `user_id` sea A;
- un `insert` con `user_id` de B falla por RLS;
- un `update` que intente cambiar `user_id` a B falla por `with check`;
- un `delete` de una fila de B no elimina nada;
- una referencia a una categoría o recurrencia de B falla por la clave foránea compuesta.

Repite el mismo control en `categories`, `expenses`, `incomes`, `budgets`, `recurring_transactions` y `user_preferences`. Usa exclusivamente cuentas de prueba.
