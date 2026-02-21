import { useState, useEffect } from 'react';
import client from '../api/client';

interface PresenceEntry {
  field: string | null;
  timestamp: number;
}

export function usePresence(recipeId: string) {
  const [presence, setPresence] = useState<Record<string, PresenceEntry>>({});

  useEffect(() => {
    let active = true;

    const poll = async () => {
      try {
        const { data } = await client.get(`/recipes/${recipeId}/presence`);
        if (active) setPresence(data);
      } catch {
        // Ignore errors — presence is best-effort
      }
    };

    poll();
    const interval = setInterval(poll, 5000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [recipeId]);

  return presence;
}
