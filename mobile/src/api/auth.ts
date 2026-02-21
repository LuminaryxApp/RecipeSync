import client from './client';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface User {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  auth_provider: string;
}

interface AuthResponse {
  user: User;
  access_token: string;
  refresh_token: string;
}

async function storeTokens(data: AuthResponse) {
  await AsyncStorage.setItem('access_token', data.access_token);
  await AsyncStorage.setItem('refresh_token', data.refresh_token);
}

export async function register(
  email: string,
  password: string,
  display_name: string
): Promise<User> {
  const { data } = await client.post<AuthResponse>('/auth/register', {
    email,
    password,
    display_name,
  });
  await storeTokens(data);
  return data.user;
}

export async function login(email: string, password: string): Promise<User> {
  const { data } = await client.post<AuthResponse>('/auth/login', {
    email,
    password,
  });
  await storeTokens(data);
  return data.user;
}

export async function loginWithGoogle(id_token: string): Promise<User> {
  const { data } = await client.post<AuthResponse>('/auth/google', { id_token });
  await storeTokens(data);
  return data.user;
}

export async function loginWithApple(
  id_token: string,
  display_name?: string
): Promise<User> {
  const { data } = await client.post<AuthResponse>('/auth/apple', {
    id_token,
    display_name,
  });
  await storeTokens(data);
  return data.user;
}
