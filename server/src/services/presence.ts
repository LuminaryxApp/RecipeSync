import { createClient } from 'redis';

const PRESENCE_TTL = 60; // seconds

// Lazy connection — only connects when actually used (not during tests)
let redis: ReturnType<typeof createClient> | null = null;

async function getRedis() {
  if (!redis) {
    redis = createClient({ url: process.env.REDIS_URL });
    redis.on('error', (err) => console.error('Redis error:', err));
    await redis.connect();
  }
  return redis;
}

export async function setPresence(recipeId: string, userId: string, field: string | null) {
  const client = await getRedis();
  const key = `presence:${recipeId}`;
  await client.hSet(key, userId, JSON.stringify({ field, timestamp: Date.now() }));
  await client.expire(key, PRESENCE_TTL);
}

export async function removePresence(recipeId: string, userId: string) {
  const client = await getRedis();
  await client.hDel(`presence:${recipeId}`, userId);
}

export async function getPresence(recipeId: string): Promise<Record<string, { field: string | null; timestamp: number }>> {
  const client = await getRedis();
  const raw = await client.hGetAll(`presence:${recipeId}`);
  const result: Record<string, any> = {};
  for (const [userId, json] of Object.entries(raw)) {
    result[userId] = JSON.parse(json);
  }
  return result;
}

export async function disconnectRedis() {
  if (redis) {
    await redis.disconnect();
    redis = null;
  }
}
