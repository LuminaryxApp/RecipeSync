import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import jwt from 'jsonwebtoken';
import * as Y from 'yjs';
import db from '../db/connection';

interface AuthenticatedSocket extends WebSocket {
  userId?: string;
  recipeId?: string;
  isAlive?: boolean;
}

// In-memory store: recipeId -> { doc, connections }
const rooms = new Map<string, { doc: Y.Doc; connections: Set<AuthenticatedSocket> }>();

export function setupWebSocketServer(server: any): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request: IncomingMessage, socket: any, head: Buffer) => {
    const pathname = (request.url || '').split('?')[0];
    if (pathname.startsWith('/ws/recipe/')) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', async (ws: AuthenticatedSocket, req: IncomingMessage) => {
    try {
      const url = new URL(req.url!, `http://${req.headers.host}`);
      const pathParts = url.pathname.split('/').filter(Boolean);
      const recipeId = pathParts[pathParts.length - 1];
      const token = url.searchParams.get('token');

      if (!token || !recipeId) {
        ws.close(4001, 'Missing token or recipe ID');
        return;
      }

      // Verify JWT
      let payload: { userId: string };
      try {
        payload = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
      } catch {
        ws.close(4001, 'Invalid token');
        return;
      }

      // Check recipe access
      const recipe = await db('recipes').where({ id: recipeId }).first();
      if (!recipe) {
        ws.close(4004, 'Recipe not found');
        return;
      }

      if (recipe.owner_id !== payload.userId) {
        const collab = await db('recipe_collaborators')
          .where({ recipe_id: recipeId, user_id: payload.userId })
          .first();
        if (!collab) {
          ws.close(4003, 'Access denied');
          return;
        }
      }

      ws.userId = payload.userId;
      ws.recipeId = recipeId;
      ws.isAlive = true;

      // Get or create room
      if (!rooms.has(recipeId)) {
        const doc = new Y.Doc();
        if (recipe.yjs_document) {
          Y.applyUpdate(doc, new Uint8Array(recipe.yjs_document));
        }
        rooms.set(recipeId, { doc, connections: new Set() });
      }

      const room = rooms.get(recipeId)!;
      room.connections.add(ws);

      // Send current doc state to new client
      const stateUpdate = Y.encodeStateAsUpdate(room.doc);
      ws.send(Buffer.from(stateUpdate));

      // Handle incoming Yjs updates
      ws.on('message', (data: Buffer) => {
        try {
          const update = new Uint8Array(data);
          Y.applyUpdate(room.doc, update);

          // Broadcast to other clients in the room
          for (const client of room.connections) {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              client.send(data);
            }
          }

          debouncedPersist(recipeId, room.doc);
        } catch (err) {
          console.error('Error applying Yjs update:', err);
        }
      });

      ws.on('close', () => {
        room.connections.delete(ws);
        if (room.connections.size === 0) {
          persistDoc(recipeId, room.doc);
          rooms.delete(recipeId);
        }
      });

      ws.on('pong', () => {
        ws.isAlive = true;
      });
    } catch (err) {
      console.error('WebSocket connection error:', err);
      ws.close(4000, 'Server error');
    }
  });

  // Heartbeat
  const interval = setInterval(() => {
    wss.clients.forEach((ws: WebSocket) => {
      const authWs = ws as AuthenticatedSocket;
      if (!authWs.isAlive) {
        authWs.terminate();
        return;
      }
      authWs.isAlive = false;
      authWs.ping();
    });
  }, 30000);

  wss.on('close', () => clearInterval(interval));

  return wss;
}

// Debounced persistence
const persistTimers = new Map<string, NodeJS.Timeout>();

function debouncedPersist(recipeId: string, doc: Y.Doc) {
  if (persistTimers.has(recipeId)) {
    clearTimeout(persistTimers.get(recipeId)!);
  }
  persistTimers.set(
    recipeId,
    setTimeout(() => {
      persistDoc(recipeId, doc);
      persistTimers.delete(recipeId);
    }, 3000)
  );
}

async function persistDoc(recipeId: string, doc: Y.Doc) {
  try {
    const state = Buffer.from(Y.encodeStateAsUpdate(doc));
    await db('recipes').where({ id: recipeId }).update({ yjs_document: state, updated_at: new Date() });
  } catch (err) {
    console.error('Error persisting Yjs document:', err);
  }
}

export { rooms };
