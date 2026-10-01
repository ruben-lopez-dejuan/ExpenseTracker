import { createClient } from 'npm:@supabase/supabase-js@2';

const jsonHeaders = { 'Content-Type': 'application/json' };

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: jsonHeaders,
    });
  }

  const authorization = request.headers.get('Authorization');
  if (!authorization) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: jsonHeaders,
    });
  }

  let body: { confirmation?: unknown };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  if (body.confirmation !== 'DELETE') {
    return new Response(JSON.stringify({ error: 'Confirmation required' }), {
      status: 400,
      headers: jsonHeaders,
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: 'Server configuration is incomplete' }), {
      status: 500,
      headers: jsonHeaders,
    });
  }

  const authenticatedClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data: { user }, error: userError } = await authenticatedClient.auth.getUser();
  if (userError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: jsonHeaders,
    });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const tables = [
    'expenses',
    'incomes',
    'budgets',
    'user_preferences',
    'categories',
    'recurring_transactions',
  ] as const;

  for (const table of tables) {
    const { error } = await admin.from(table).delete().eq('user_id', user.id);
    if (error) {
      console.error(`Could not delete ${table} for ${user.id}`, error);
      return new Response(JSON.stringify({ error: 'Account data could not be deleted' }), {
        status: 500,
        headers: jsonHeaders,
      });
    }
  }

  const { error: deleteUserError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteUserError) {
    console.error(`Could not delete auth user ${user.id}`, deleteUserError);
    return new Response(JSON.stringify({ error: 'Account could not be deleted' }), {
      status: 500,
      headers: jsonHeaders,
    });
  }

  return new Response(JSON.stringify({ deleted: true }), {
    status: 200,
    headers: jsonHeaders,
  });
});
