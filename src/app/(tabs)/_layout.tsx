import {
  Redirect,
  Stack,
} from 'expo-router';

import { useAuth } from '../../context/auth-context';
import { E5ModelProvider } from '../../context/e5-model-context';

export default function MainLayout() {
  const { session, loading } = useAuth();

  if (loading) {
    return null;
  }

  if (!session) {
    return <Redirect href="/auth" />;
  }

  return (
    <E5ModelProvider>
      <Stack
        screenOptions={{
          headerShown: false,
        }}
      />
    </E5ModelProvider>
  );
}
