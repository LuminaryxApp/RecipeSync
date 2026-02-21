import { useEffect, useRef, useState, useCallback } from 'react';
import * as Y from 'yjs';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DEV_WS_URL = 'ws://localhost:3000';
const PROD_WS_URL = 'wss://api.recipesync.com';
const WS_URL = __DEV__ ? DEV_WS_URL : PROD_WS_URL;

export function useYjsCollaboration(recipeId: string) {
  const docRef = useRef(new Y.Doc());
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [synced, setSynced] = useState(false);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const doc = docRef.current;
    let destroyed = false;

    const connect = async () => {
      if (destroyed) return;

      const token = await AsyncStorage.getItem('access_token');
      if (!token) return;

      const ws = new WebSocket(
        `${WS_URL}/ws/recipe/${recipeId}?token=${token}`
      );
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      ws.onopen = () => {
        if (!destroyed) setConnected(true);
      };

      ws.onmessage = (event) => {
        if (destroyed) return;
        const update = new Uint8Array(event.data as ArrayBuffer);
        Y.applyUpdate(doc, update);
        setSynced(true);
      };

      ws.onclose = () => {
        if (destroyed) return;
        setConnected(false);
        // Reconnect after 2 seconds
        reconnectTimeoutRef.current = setTimeout(connect, 2000);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    // Send local updates to server
    const updateHandler = (update: Uint8Array, origin: any) => {
      if (
        origin !== 'remote' &&
        wsRef.current?.readyState === WebSocket.OPEN
      ) {
        wsRef.current.send(update);
      }
    };

    doc.on('update', updateHandler);
    connect();

    return () => {
      destroyed = true;
      doc.off('update', updateHandler);
      wsRef.current?.close();
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [recipeId]);

  const getMap = useCallback(
    (name: string) => docRef.current.getMap(name),
    []
  );
  const getText = useCallback(
    (name: string) => docRef.current.getText(name),
    []
  );
  const getArray = useCallback(
    (name: string) => docRef.current.getArray(name),
    []
  );

  return {
    doc: docRef.current,
    connected,
    synced,
    getMap,
    getText,
    getArray,
  };
}
