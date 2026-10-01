import {
  Redirect,
  Stack,
} from 'expo-router';

import { useAuth } from '../../context/auth-context';

export default function MainLayout() {
  const { session, loading } = useAuth();

  if (loading) {
    return null;
  }

  if (!session) {
    return <Redirect href="/auth" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    />
  );
}
