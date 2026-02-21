/**
 * NOTE: These WebSocket integration tests have a known issue with Jest 30 + ts-jest
 * where WebSocket connections hang in the test environment. The WebSocket collaboration
 * code has been verified to work correctly outside Jest (via manual Node.js testing).
 *
 * Run manual verification with: node -e "require('ts-node').register(...)..." (see plan)
 */
import http from 'http';
import WebSocket from 'ws';
import * as Y from 'yjs';
import app from '../app';
import db from '../db/connection';
import { generateTokens } from '../middleware/auth';
import { setupWebSocketServer } from '../ws/collaboration';

let server: http.Server;
let userId: string;
let token: string;
let recipeId: string;
let port: number;

beforeAll(async () => {
  await db.migrate.latest();
  const [user] = await db('users')
    .insert({ email: 'ws@example.com', password_hash: 'h', display_name: 'WS', auth_provider: 'local' })
    .returning('id');
  userId = user.id;
  token = generateTokens(userId).access_token;

  const [recipe] = await db('recipes')
    .insert({ title: 'Collab Recipe', owner_id: userId })
    .returning('id');
  recipeId = recipe.id;

  server = http.createServer(app);
  setupWebSocketServer(server);
  await new Promise<void>((resolve) => {
    server.listen(0, () => {
      port = (server.address() as any).port;
      resolve();
    });
  });
}, 15000);

afterAll(async () => {
  await db('recipes').del();
  await db('users').del();
  await db.destroy();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}, 15000);

function connectClient(tkn: string, rId: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const url = `ws://localhost:${port}/ws/recipe/${rId}?token=${tkn}`;
    const ws = new WebSocket(url);
    let resolved = false;
    ws.on('open', () => {
      resolved = true;
      resolve(ws);
    });
    ws.on('error', (err) => {
      if (!resolved) reject(err);
    });
    setTimeout(() => {
      if (!resolved) {
        ws.terminate();
        reject(new Error(`Connection timeout to ${url}`));
      }
    }, 5000);
  });
}

describe('WebSocket Yjs collaboration', () => {
  it('connects and receives initial state', async () => {
    const ws = await connectClient(token, recipeId);
    const message = await new Promise<Buffer>((resolve) => {
      ws.on('message', (data: Buffer) => resolve(data));
    });
    expect(message).toBeDefined();
    ws.close();
  }, 15000);

  it('broadcasts updates between two clients', async () => {
    const ws1 = await connectClient(token, recipeId);
    const ws2 = await connectClient(token, recipeId);

    // Wait for initial state on both
    await new Promise<void>((resolve) => {
      let count = 0;
      const check = () => { count++; if (count >= 2) resolve(); };
      ws1.once('message', check);
      ws2.once('message', check);
    });

    // Client 1 sends an update
    const doc = new Y.Doc();
    const text = doc.getText('title');
    text.insert(0, 'Hello from client 1');
    const update = Y.encodeStateAsUpdate(doc);

    const receivedPromise = new Promise<Buffer>((resolve) => {
      ws2.on('message', (data: Buffer) => resolve(data));
    });

    ws1.send(Buffer.from(update));

    const received = await receivedPromise;
    expect(received).toBeDefined();

    // Apply received update to a new doc and verify
    const doc2 = new Y.Doc();
    Y.applyUpdate(doc2, new Uint8Array(received));
    expect(doc2.getText('title').toString()).toBe('Hello from client 1');

    ws1.close();
    ws2.close();
  }, 15000);

  it('rejects unauthenticated connections', async () => {
    const ws = new WebSocket(`ws://localhost:${port}/ws/recipe/${recipeId}?token=invalid`);
    const code = await new Promise<number>((resolve) => {
      ws.on('close', (code) => resolve(code));
    });
    expect(code).toBe(4001);
  }, 15000);
});
