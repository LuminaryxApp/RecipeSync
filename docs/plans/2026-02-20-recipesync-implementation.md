# RecipeSync Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a React Native mobile app with a custom Node.js backend that enables Google Docs-style real-time collaborative recipe editing using CRDTs.

**Architecture:** React Native frontend communicates with a Node.js/Express backend via REST (auth, CRUD) and WebSockets (Yjs CRDT sync + presence). PostgreSQL stores persistent data, Redis handles presence/cache, Cloudinary hosts images.

**Tech Stack:** React Native, Node.js, Express, PostgreSQL, Redis, Yjs, WebSockets (ws), Cloudinary, JWT, Jest, Supertest

---

## Task 1: Backend Project Scaffolding

**Files:**
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/.env.example`
- Create: `server/src/index.ts`
- Create: `server/src/app.ts`

**Step 1: Initialize the backend project**

```bash
cd server
npm init -y
```

**Step 2: Install core dependencies**

```bash
npm install express cors helmet dotenv pg knex redis jsonwebtoken bcryptjs yjs y-protocols ws cloudinary multer uuid
npm install -D typescript @types/express @types/cors @types/jsonwebtoken @types/bcryptjs @types/ws @types/multer @types/uuid ts-node nodemon jest ts-jest @types/jest supertest @types/supertest
```

**Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 4: Create .env.example**

```
PORT=3000
DATABASE_URL=postgresql://localhost:5432/recipesync
REDIS_URL=redis://localhost:6379
JWT_SECRET=change-me-in-production
JWT_REFRESH_SECRET=change-me-refresh-secret
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
GOOGLE_CLIENT_ID=your-google-client-id
APPLE_CLIENT_ID=your-apple-client-id
```

**Step 5: Create src/app.ts (Express app without listen)**

```typescript
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

export default app;
```

**Step 6: Create src/index.ts (entry point)**

```typescript
import dotenv from 'dotenv';
dotenv.config();

import app from './app';

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`RecipeSync server running on port ${PORT}`);
});
```

**Step 7: Add scripts to package.json**

```json
{
  "scripts": {
    "dev": "nodemon --exec ts-node src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "jest --config jest.config.js"
  }
}
```

**Step 8: Create jest.config.js**

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
};
```

**Step 9: Write a smoke test**

Create `server/src/__tests__/app.test.ts`:

```typescript
import request from 'supertest';
import app from '../app';

describe('Health check', () => {
  it('GET /api/health returns ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
```

**Step 10: Run the test**

```bash
cd server && npx jest --config jest.config.js
```

Expected: PASS

**Step 11: Commit**

```bash
git add server/
git commit -m "feat: scaffold backend with Express, TypeScript, and health check"
```

---

## Task 2: Database Setup with Knex Migrations

**Files:**
- Create: `server/knexfile.ts`
- Create: `server/src/db/connection.ts`
- Create: `server/src/db/migrations/001_create_users.ts`
- Create: `server/src/db/migrations/002_create_recipes.ts`
- Create: `server/src/db/migrations/003_create_ingredients.ts`
- Create: `server/src/db/migrations/004_create_steps.ts`
- Create: `server/src/db/migrations/005_create_recipe_collaborators.ts`

**Step 1: Create knexfile.ts**

```typescript
import type { Knex } from 'knex';
import dotenv from 'dotenv';
dotenv.config();

const config: { [key: string]: Knex.Config } = {
  development: {
    client: 'pg',
    connection: process.env.DATABASE_URL,
    migrations: {
      directory: './src/db/migrations',
      extension: 'ts',
    },
  },
  test: {
    client: 'pg',
    connection: process.env.TEST_DATABASE_URL || 'postgresql://localhost:5432/recipesync_test',
    migrations: {
      directory: './src/db/migrations',
      extension: 'ts',
    },
  },
};

export default config;
```

**Step 2: Create src/db/connection.ts**

```typescript
import knex from 'knex';
import config from '../../knexfile';

const environment = process.env.NODE_ENV || 'development';
const db = knex(config[environment]);

export default db;
```

**Step 3: Create migration 001_create_users.ts**

```typescript
import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  await knex.schema.createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('email').unique().notNullable();
    table.string('password_hash').nullable();
    table.string('display_name').notNullable();
    table.string('avatar_url').nullable();
    table.enum('auth_provider', ['local', 'google', 'apple']).notNullable().defaultTo('local');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('users');
}
```

**Step 4: Create migration 002_create_recipes.ts**

```typescript
import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('recipes', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('owner_id').references('id').inTable('users').onDelete('CASCADE').notNullable();
    table.string('title').notNullable();
    table.text('description').nullable();
    table.integer('prep_time_minutes').nullable();
    table.integer('cook_time_minutes').nullable();
    table.integer('servings').nullable();
    table.enum('difficulty', ['easy', 'medium', 'hard']).nullable();
    table.specificType('tags', 'text[]').defaultTo('{}');
    table.jsonb('nutritional_info').nullable();
    table.binary('yjs_document').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('recipes');
}
```

**Step 5: Create migration 003_create_ingredients.ts**

```typescript
import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('ingredients', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('recipe_id').references('id').inTable('recipes').onDelete('CASCADE').notNullable();
    table.string('name').notNullable();
    table.decimal('quantity', 10, 3).nullable();
    table.string('unit').nullable();
    table.integer('order_index').notNullable().defaultTo(0);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('ingredients');
}
```

**Step 6: Create migration 004_create_steps.ts**

```typescript
import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('steps', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('recipe_id').references('id').inTable('recipes').onDelete('CASCADE').notNullable();
    table.text('instruction').notNullable();
    table.string('image_url').nullable();
    table.integer('order_index').notNullable().defaultTo(0);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('steps');
}
```

**Step 7: Create migration 005_create_recipe_collaborators.ts**

```typescript
import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('recipe_collaborators', (table) => {
    table.uuid('recipe_id').references('id').inTable('recipes').onDelete('CASCADE').notNullable();
    table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE').notNullable();
    table.enum('role', ['editor', 'viewer']).notNullable().defaultTo('editor');
    table.timestamp('invited_at').defaultTo(knex.fn.now());
    table.primary(['recipe_id', 'user_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('recipe_collaborators');
}
```

**Step 8: Run migrations**

```bash
cd server && npx knex migrate:latest --knexfile knexfile.ts
```

Expected: All 5 migrations run successfully.

**Step 9: Commit**

```bash
git add server/
git commit -m "feat: add database schema with Knex migrations"
```

---

## Task 3: Auth — Registration & Login (Email/Password)

**Files:**
- Create: `server/src/middleware/auth.ts`
- Create: `server/src/routes/auth.ts`
- Create: `server/src/__tests__/auth.test.ts`
- Modify: `server/src/app.ts`

**Step 1: Write the failing tests**

Create `server/src/__tests__/auth.test.ts`:

```typescript
import request from 'supertest';
import app from '../app';
import db from '../db/connection';

beforeAll(async () => {
  await db.migrate.latest();
});

afterAll(async () => {
  await db('users').del();
  await db.destroy();
});

describe('POST /api/auth/register', () => {
  it('creates a new user and returns tokens', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'test@example.com',
        password: 'SecurePass123!',
        display_name: 'Test User',
      });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('test@example.com');
    expect(res.body.user.display_name).toBe('Test User');
    expect(res.body.access_token).toBeDefined();
    expect(res.body.refresh_token).toBeDefined();
    expect(res.body.user.password_hash).toBeUndefined();
  });

  it('rejects duplicate email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'test@example.com',
        password: 'SecurePass123!',
        display_name: 'Test User 2',
      });

    expect(res.status).toBe(409);
  });

  it('rejects missing fields', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'no-password@example.com' });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  it('returns tokens for valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'SecurePass123!',
      });

    expect(res.status).toBe(200);
    expect(res.body.access_token).toBeDefined();
    expect(res.body.refresh_token).toBeDefined();
  });

  it('rejects invalid password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'WrongPassword',
      });

    expect(res.status).toBe(401);
  });

  it('rejects nonexistent email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'nobody@example.com',
        password: 'SecurePass123!',
      });

    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/refresh', () => {
  it('returns a new access token for valid refresh token', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'SecurePass123!' });

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refresh_token: loginRes.body.refresh_token });

    expect(res.status).toBe(200);
    expect(res.body.access_token).toBeDefined();
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
cd server && npx jest --config jest.config.js src/__tests__/auth.test.ts
```

Expected: FAIL — routes don't exist yet.

**Step 3: Create src/middleware/auth.ts**

```typescript
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  userId?: string;
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return;
  }

  const token = header.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
    req.userId = payload.userId;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function generateTokens(userId: string) {
  const access_token = jwt.sign({ userId }, process.env.JWT_SECRET!, { expiresIn: '15m' });
  const refresh_token = jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET!, { expiresIn: '7d' });
  return { access_token, refresh_token };
}
```

**Step 4: Create src/routes/auth.ts**

```typescript
import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../db/connection';
import { generateTokens } from '../middleware/auth';

const router = Router();

router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, display_name } = req.body;

    if (!email || !password || !display_name) {
      res.status(400).json({ error: 'email, password, and display_name are required' });
      return;
    }

    const existing = await db('users').where({ email }).first();
    if (existing) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }

    const password_hash = await bcrypt.hash(password, 12);
    const [user] = await db('users')
      .insert({ email, password_hash, display_name, auth_provider: 'local' })
      .returning(['id', 'email', 'display_name', 'avatar_url', 'auth_provider', 'created_at']);

    const tokens = generateTokens(user.id);
    res.status(201).json({ user, ...tokens });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const user = await db('users').where({ email }).first();
    if (!user || !user.password_hash) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const tokens = generateTokens(user.id);
    const { password_hash, ...safeUser } = user;
    res.json({ user: safeUser, ...tokens });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) {
      res.status(400).json({ error: 'refresh_token is required' });
      return;
    }

    const payload = jwt.verify(refresh_token, process.env.JWT_REFRESH_SECRET!) as { userId: string };
    const tokens = generateTokens(payload.userId);
    res.json(tokens);
  } catch {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

export default router;
```

**Step 5: Wire routes into app.ts**

Add to `server/src/app.ts`:

```typescript
import authRoutes from './routes/auth';
// ... after app.use(express.json())
app.use('/api/auth', authRoutes);
```

**Step 6: Run auth tests**

```bash
cd server && npx jest --config jest.config.js src/__tests__/auth.test.ts
```

Expected: PASS (all 6 tests)

**Step 7: Commit**

```bash
git add server/src/
git commit -m "feat: add email/password auth with register, login, refresh"
```

---

## Task 4: Auth — Social Login (Google + Apple)

**Files:**
- Modify: `server/src/routes/auth.ts`
- Create: `server/src/__tests__/auth-social.test.ts`

**Step 1: Install Google/Apple token verification**

```bash
cd server && npm install google-auth-library
```

Note: Apple Sign-In verification uses `jsonwebtoken` (already installed) to decode Apple's identity token.

**Step 2: Write failing tests**

Create `server/src/__tests__/auth-social.test.ts`:

```typescript
import request from 'supertest';
import app from '../app';
import db from '../db/connection';

beforeAll(async () => {
  await db.migrate.latest();
});

afterAll(async () => {
  await db('users').del();
  await db.destroy();
});

describe('POST /api/auth/google', () => {
  it('rejects missing id_token', async () => {
    const res = await request(app)
      .post('/api/auth/google')
      .send({});

    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/apple', () => {
  it('rejects missing id_token', async () => {
    const res = await request(app)
      .post('/api/auth/apple')
      .send({});

    expect(res.status).toBe(400);
  });
});
```

**Step 3: Run tests to verify they fail**

```bash
cd server && npx jest --config jest.config.js src/__tests__/auth-social.test.ts
```

Expected: FAIL — routes don't exist yet.

**Step 4: Add Google and Apple routes to src/routes/auth.ts**

Append to the existing router:

```typescript
import { OAuth2Client } from 'google-auth-library';

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

router.post('/google', async (req: Request, res: Response) => {
  try {
    const { id_token } = req.body;
    if (!id_token) {
      res.status(400).json({ error: 'id_token is required' });
      return;
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      res.status(401).json({ error: 'Invalid Google token' });
      return;
    }

    let user = await db('users').where({ email: payload.email }).first();
    if (!user) {
      [user] = await db('users')
        .insert({
          email: payload.email,
          display_name: payload.name || payload.email,
          avatar_url: payload.picture || null,
          auth_provider: 'google',
        })
        .returning(['id', 'email', 'display_name', 'avatar_url', 'auth_provider', 'created_at']);
    }

    const tokens = generateTokens(user.id);
    const { password_hash, ...safeUser } = user;
    res.json({ user: safeUser, ...tokens });
  } catch {
    res.status(401).json({ error: 'Invalid Google token' });
  }
});

router.post('/apple', async (req: Request, res: Response) => {
  try {
    const { id_token, display_name } = req.body;
    if (!id_token) {
      res.status(400).json({ error: 'id_token is required' });
      return;
    }

    // Decode Apple identity token (JWT) — in production, verify signature with Apple's public keys
    const decoded = jwt.decode(id_token) as { email?: string; sub?: string } | null;
    if (!decoded || !decoded.email) {
      res.status(401).json({ error: 'Invalid Apple token' });
      return;
    }

    let user = await db('users').where({ email: decoded.email }).first();
    if (!user) {
      [user] = await db('users')
        .insert({
          email: decoded.email,
          display_name: display_name || decoded.email,
          auth_provider: 'apple',
        })
        .returning(['id', 'email', 'display_name', 'avatar_url', 'auth_provider', 'created_at']);
    }

    const tokens = generateTokens(user.id);
    const { password_hash, ...safeUser } = user;
    res.json({ user: safeUser, ...tokens });
  } catch {
    res.status(401).json({ error: 'Invalid Apple token' });
  }
});
```

**Step 5: Run tests**

```bash
cd server && npx jest --config jest.config.js src/__tests__/auth-social.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add server/src/
git commit -m "feat: add Google and Apple social login endpoints"
```

---

## Task 5: Recipe CRUD API

**Files:**
- Create: `server/src/routes/recipes.ts`
- Create: `server/src/__tests__/recipes.test.ts`
- Modify: `server/src/app.ts`

**Step 1: Write failing tests**

Create `server/src/__tests__/recipes.test.ts`:

```typescript
import request from 'supertest';
import app from '../app';
import db from '../db/connection';
import { generateTokens } from '../middleware/auth';

let userId: string;
let token: string;
let recipeId: string;

beforeAll(async () => {
  await db.migrate.latest();
  const [user] = await db('users')
    .insert({
      email: 'chef@example.com',
      password_hash: 'hashed',
      display_name: 'Chef',
      auth_provider: 'local',
    })
    .returning('id');
  userId = user.id;
  token = generateTokens(userId).access_token;
});

afterAll(async () => {
  await db('recipes').del();
  await db('users').del();
  await db.destroy();
});

describe('POST /api/recipes', () => {
  it('creates a recipe', async () => {
    const res = await request(app)
      .post('/api/recipes')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Spaghetti Carbonara', description: 'Classic Italian pasta' });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Spaghetti Carbonara');
    expect(res.body.owner_id).toBe(userId);
    recipeId = res.body.id;
  });

  it('rejects unauthenticated request', async () => {
    const res = await request(app)
      .post('/api/recipes')
      .send({ title: 'No Auth' });

    expect(res.status).toBe(401);
  });
});

describe('GET /api/recipes', () => {
  it('lists user recipes', async () => {
    const res = await request(app)
      .get('/api/recipes')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });
});

describe('GET /api/recipes/:id', () => {
  it('returns recipe details with ingredients and steps', async () => {
    const res = await request(app)
      .get(`/api/recipes/${recipeId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Spaghetti Carbonara');
    expect(res.body.ingredients).toBeDefined();
    expect(res.body.steps).toBeDefined();
  });
});

describe('PUT /api/recipes/:id/metadata', () => {
  it('updates metadata fields', async () => {
    const res = await request(app)
      .put(`/api/recipes/${recipeId}/metadata`)
      .set('Authorization', `Bearer ${token}`)
      .send({ prep_time_minutes: 15, cook_time_minutes: 20, servings: 4, difficulty: 'medium' });

    expect(res.status).toBe(200);
    expect(res.body.prep_time_minutes).toBe(15);
    expect(res.body.servings).toBe(4);
  });
});

describe('DELETE /api/recipes/:id', () => {
  it('deletes recipe as owner', async () => {
    const res = await request(app)
      .delete(`/api/recipes/${recipeId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(204);
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
cd server && npx jest --config jest.config.js src/__tests__/recipes.test.ts
```

Expected: FAIL

**Step 3: Create src/routes/recipes.ts**

```typescript
import { Router, Response } from 'express';
import db from '../db/connection';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(authenticate);

// List user's recipes (owned + collaborating)
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const owned = db('recipes').where({ owner_id: req.userId });
    const collaborating = db('recipes')
      .join('recipe_collaborators', 'recipes.id', 'recipe_collaborators.recipe_id')
      .where({ 'recipe_collaborators.user_id': req.userId })
      .select('recipes.*');

    const recipes = await owned.union(collaborating);
    res.json(recipes);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create recipe
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { title, description } = req.body;
    if (!title) {
      res.status(400).json({ error: 'title is required' });
      return;
    }

    const [recipe] = await db('recipes')
      .insert({ title, description, owner_id: req.userId })
      .returning('*');

    res.status(201).json(recipe);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get recipe details
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const recipe = await db('recipes').where({ id: req.params.id }).first();
    if (!recipe) {
      res.status(404).json({ error: 'Recipe not found' });
      return;
    }

    // Check access: owner or collaborator
    if (recipe.owner_id !== req.userId) {
      const collab = await db('recipe_collaborators')
        .where({ recipe_id: recipe.id, user_id: req.userId })
        .first();
      if (!collab) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }
    }

    const ingredients = await db('ingredients')
      .where({ recipe_id: recipe.id })
      .orderBy('order_index');
    const steps = await db('steps')
      .where({ recipe_id: recipe.id })
      .orderBy('order_index');

    res.json({ ...recipe, ingredients, steps });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update metadata
router.put('/:id/metadata', async (req: AuthRequest, res: Response) => {
  try {
    const recipe = await db('recipes').where({ id: req.params.id }).first();
    if (!recipe) {
      res.status(404).json({ error: 'Recipe not found' });
      return;
    }
    if (recipe.owner_id !== req.userId) {
      const collab = await db('recipe_collaborators')
        .where({ recipe_id: recipe.id, user_id: req.userId, role: 'editor' })
        .first();
      if (!collab) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }
    }

    const allowed = ['prep_time_minutes', 'cook_time_minutes', 'servings', 'difficulty', 'tags', 'nutritional_info'];
    const updates: Record<string, any> = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    updates.updated_at = new Date();

    const [updated] = await db('recipes')
      .where({ id: req.params.id })
      .update(updates)
      .returning('*');

    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete recipe (owner only)
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const recipe = await db('recipes').where({ id: req.params.id }).first();
    if (!recipe) {
      res.status(404).json({ error: 'Recipe not found' });
      return;
    }
    if (recipe.owner_id !== req.userId) {
      res.status(403).json({ error: 'Only the owner can delete a recipe' });
      return;
    }

    await db('recipes').where({ id: req.params.id }).del();
    res.status(204).send();
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
```

**Step 4: Wire into app.ts**

Add to `server/src/app.ts`:

```typescript
import recipeRoutes from './routes/recipes';
// ... after auth routes
app.use('/api/recipes', recipeRoutes);
```

**Step 5: Run tests**

```bash
cd server && npx jest --config jest.config.js src/__tests__/recipes.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add server/src/
git commit -m "feat: add recipe CRUD with authorization"
```

---

## Task 6: Collaborator Management API

**Files:**
- Create: `server/src/routes/collaborators.ts`
- Create: `server/src/__tests__/collaborators.test.ts`
- Modify: `server/src/app.ts`

**Step 1: Write failing tests**

Create `server/src/__tests__/collaborators.test.ts`:

```typescript
import request from 'supertest';
import app from '../app';
import db from '../db/connection';
import { generateTokens } from '../middleware/auth';

let ownerId: string;
let collabUserId: string;
let ownerToken: string;
let recipeId: string;

beforeAll(async () => {
  await db.migrate.latest();
  const [owner] = await db('users')
    .insert({ email: 'owner@example.com', password_hash: 'h', display_name: 'Owner', auth_provider: 'local' })
    .returning('id');
  const [collab] = await db('users')
    .insert({ email: 'collab@example.com', password_hash: 'h', display_name: 'Collab', auth_provider: 'local' })
    .returning('id');
  ownerId = owner.id;
  collabUserId = collab.id;
  ownerToken = generateTokens(ownerId).access_token;

  const [recipe] = await db('recipes')
    .insert({ title: 'Shared Recipe', owner_id: ownerId })
    .returning('id');
  recipeId = recipe.id;
});

afterAll(async () => {
  await db('recipe_collaborators').del();
  await db('recipes').del();
  await db('users').del();
  await db.destroy();
});

describe('POST /api/recipes/:id/collaborators', () => {
  it('invites a collaborator by email', async () => {
    const res = await request(app)
      .post(`/api/recipes/${recipeId}/collaborators`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: 'collab@example.com', role: 'editor' });

    expect(res.status).toBe(201);
    expect(res.body.user_id).toBe(collabUserId);
    expect(res.body.role).toBe('editor');
  });
});

describe('GET /api/recipes/:id/collaborators', () => {
  it('lists collaborators', async () => {
    const res = await request(app)
      .get(`/api/recipes/${recipeId}/collaborators`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
  });
});

describe('PUT /api/recipes/:id/collaborators/:uid', () => {
  it('updates collaborator role', async () => {
    const res = await request(app)
      .put(`/api/recipes/${recipeId}/collaborators/${collabUserId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ role: 'viewer' });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe('viewer');
  });
});

describe('DELETE /api/recipes/:id/collaborators/:uid', () => {
  it('removes a collaborator', async () => {
    const res = await request(app)
      .delete(`/api/recipes/${recipeId}/collaborators/${collabUserId}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(204);
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
cd server && npx jest --config jest.config.js src/__tests__/collaborators.test.ts
```

Expected: FAIL

**Step 3: Create src/routes/collaborators.ts**

```typescript
import { Router, Response } from 'express';
import db from '../db/connection';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router({ mergeParams: true });

router.use(authenticate);

// Invite collaborator by email
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { id: recipeId } = req.params;
    const { email, role } = req.body;

    const recipe = await db('recipes').where({ id: recipeId }).first();
    if (!recipe || recipe.owner_id !== req.userId) {
      res.status(403).json({ error: 'Only the owner can invite collaborators' });
      return;
    }

    const user = await db('users').where({ email }).first();
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const [collab] = await db('recipe_collaborators')
      .insert({ recipe_id: recipeId, user_id: user.id, role: role || 'editor' })
      .returning('*');

    res.status(201).json(collab);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// List collaborators
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const collaborators = await db('recipe_collaborators')
      .join('users', 'recipe_collaborators.user_id', 'users.id')
      .where({ recipe_id: req.params.id })
      .select('recipe_collaborators.*', 'users.email', 'users.display_name', 'users.avatar_url');

    res.json(collaborators);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update role
router.put('/:uid', async (req: AuthRequest, res: Response) => {
  try {
    const recipe = await db('recipes').where({ id: req.params.id }).first();
    if (!recipe || recipe.owner_id !== req.userId) {
      res.status(403).json({ error: 'Only the owner can update roles' });
      return;
    }

    const [updated] = await db('recipe_collaborators')
      .where({ recipe_id: req.params.id, user_id: req.params.uid })
      .update({ role: req.body.role })
      .returning('*');

    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Remove collaborator
router.delete('/:uid', async (req: AuthRequest, res: Response) => {
  try {
    const recipe = await db('recipes').where({ id: req.params.id }).first();
    if (!recipe || recipe.owner_id !== req.userId) {
      res.status(403).json({ error: 'Only the owner can remove collaborators' });
      return;
    }

    await db('recipe_collaborators')
      .where({ recipe_id: req.params.id, user_id: req.params.uid })
      .del();

    res.status(204).send();
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
```

**Step 4: Wire into app.ts**

Add to `server/src/app.ts`:

```typescript
import collaboratorRoutes from './routes/collaborators';
// ... after recipe routes
app.use('/api/recipes/:id/collaborators', collaboratorRoutes);
```

**Step 5: Run tests**

```bash
cd server && npx jest --config jest.config.js src/__tests__/collaborators.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add server/src/
git commit -m "feat: add collaborator invite, list, update, remove endpoints"
```

---

## Task 7: Image Upload via Cloudinary

**Files:**
- Create: `server/src/routes/images.ts`
- Create: `server/src/config/cloudinary.ts`
- Create: `server/src/__tests__/images.test.ts`
- Modify: `server/src/app.ts`

**Step 1: Create src/config/cloudinary.ts**

```typescript
import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export default cloudinary;
```

**Step 2: Create src/routes/images.ts**

```typescript
import { Router, Response } from 'express';
import multer from 'multer';
import cloudinary from '../config/cloudinary';
import db from '../db/connection';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router({ mergeParams: true });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(authenticate);

router.post('/', upload.single('image'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No image file provided' });
      return;
    }

    const recipe = await db('recipes').where({ id: req.params.id }).first();
    if (!recipe) {
      res.status(404).json({ error: 'Recipe not found' });
      return;
    }

    // Check access
    if (recipe.owner_id !== req.userId) {
      const collab = await db('recipe_collaborators')
        .where({ recipe_id: recipe.id, user_id: req.userId, role: 'editor' })
        .first();
      if (!collab) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }
    }

    const result = await new Promise<any>((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { folder: `recipesync/${req.params.id}`, resource_type: 'image' },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      ).end(req.file!.buffer);
    });

    res.status(201).json({
      image_id: result.public_id,
      url: result.secure_url,
      width: result.width,
      height: result.height,
    });
  } catch {
    res.status(500).json({ error: 'Image upload failed' });
  }
});

router.delete('/:imageId', async (req: AuthRequest, res: Response) => {
  try {
    const recipe = await db('recipes').where({ id: req.params.id }).first();
    if (!recipe || recipe.owner_id !== req.userId) {
      res.status(403).json({ error: 'Only the owner can delete images' });
      return;
    }

    await cloudinary.uploader.destroy(req.params.imageId);
    res.status(204).send();
  } catch {
    res.status(500).json({ error: 'Image deletion failed' });
  }
});

export default router;
```

**Step 3: Wire into app.ts**

Add to `server/src/app.ts`:

```typescript
import imageRoutes from './routes/images';
app.use('/api/recipes/:id/images', imageRoutes);
```

**Step 4: Write a basic test (mocking Cloudinary)**

Create `server/src/__tests__/images.test.ts`:

```typescript
import request from 'supertest';
import app from '../app';
import db from '../db/connection';
import { generateTokens } from '../middleware/auth';

jest.mock('../config/cloudinary', () => ({
  __esModule: true,
  default: {
    uploader: {
      upload_stream: jest.fn((_opts, callback) => {
        const stream = { end: jest.fn() };
        callback(null, {
          public_id: 'recipesync/test/abc123',
          secure_url: 'https://res.cloudinary.com/test/image/upload/abc123.jpg',
          width: 800,
          height: 600,
        });
        return stream;
      }),
      destroy: jest.fn().mockResolvedValue({ result: 'ok' }),
    },
  },
}));

let token: string;
let recipeId: string;

beforeAll(async () => {
  await db.migrate.latest();
  const [user] = await db('users')
    .insert({ email: 'img@example.com', password_hash: 'h', display_name: 'Img', auth_provider: 'local' })
    .returning('id');
  token = generateTokens(user.id).access_token;

  const [recipe] = await db('recipes')
    .insert({ title: 'Photo Recipe', owner_id: user.id })
    .returning('id');
  recipeId = recipe.id;
});

afterAll(async () => {
  await db('recipes').del();
  await db('users').del();
  await db.destroy();
});

describe('POST /api/recipes/:id/images', () => {
  it('uploads an image', async () => {
    const res = await request(app)
      .post(`/api/recipes/${recipeId}/images`)
      .set('Authorization', `Bearer ${token}`)
      .attach('image', Buffer.from('fake-image'), 'test.jpg');

    expect(res.status).toBe(201);
    expect(res.body.url).toContain('cloudinary');
    expect(res.body.image_id).toBeDefined();
  });
});
```

**Step 5: Run tests**

```bash
cd server && npx jest --config jest.config.js src/__tests__/images.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add server/src/
git commit -m "feat: add Cloudinary image upload and delete endpoints"
```

---

## Task 8: WebSocket Server + Yjs Collaboration

**Files:**
- Create: `server/src/ws/collaboration.ts`
- Create: `server/src/__tests__/collaboration.test.ts`
- Modify: `server/src/index.ts`

**Step 1: Create src/ws/collaboration.ts**

```typescript
import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import jwt from 'jsonwebtoken';
import * as Y from 'yjs';
import { applyUpdate, encodeStateAsUpdate } from 'yjs';
import db from '../db/connection';

interface AuthenticatedSocket extends WebSocket {
  userId?: string;
  recipeId?: string;
  isAlive?: boolean;
}

// In-memory store: recipeId -> { doc, connections }
const rooms = new Map<string, { doc: Y.Doc; connections: Set<AuthenticatedSocket> }>();

export function setupWebSocketServer(server: any): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws/recipe' });

  wss.on('connection', async (ws: AuthenticatedSocket, req: IncomingMessage) => {
    try {
      // Parse recipe ID and token from URL: /ws/recipe/:id?token=xxx
      const url = new URL(req.url!, `http://${req.headers.host}`);
      const pathParts = url.pathname.split('/');
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
        // Load existing Yjs state from database
        if (recipe.yjs_document) {
          applyUpdate(doc, new Uint8Array(recipe.yjs_document));
        }
        rooms.set(recipeId, { doc, connections: new Set() });
      }

      const room = rooms.get(recipeId)!;
      room.connections.add(ws);

      // Send current doc state to new client
      const stateUpdate = encodeStateAsUpdate(room.doc);
      ws.send(stateUpdate);

      // Handle incoming Yjs updates
      ws.on('message', (data: Buffer) => {
        try {
          const update = new Uint8Array(data);
          applyUpdate(room.doc, update);

          // Broadcast to other clients in the room
          for (const client of room.connections) {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              client.send(data);
            }
          }

          // Debounced persist to database
          debouncedPersist(recipeId, room.doc);
        } catch (err) {
          console.error('Error applying Yjs update:', err);
        }
      });

      ws.on('close', () => {
        room.connections.delete(ws);
        if (room.connections.size === 0) {
          // Persist and clean up empty room
          persistDoc(recipeId, room.doc);
          rooms.delete(recipeId);
        }
      });

      ws.on('pong', () => {
        ws.isAlive = true;
      });
    } catch (err) {
      ws.close(4000, 'Server error');
    }
  });

  // Heartbeat to detect dead connections
  const interval = setInterval(() => {
    wss.clients.forEach((ws: AuthenticatedSocket) => {
      if (!ws.isAlive) {
        ws.terminate();
        return;
      }
      ws.isAlive = false;
      ws.ping();
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
    const state = Buffer.from(encodeStateAsUpdate(doc));
    await db('recipes').where({ id: recipeId }).update({ yjs_document: state, updated_at: new Date() });
  } catch (err) {
    console.error('Error persisting Yjs document:', err);
  }
}

export { rooms };
```

**Step 2: Update src/index.ts to attach WebSocket server**

```typescript
import dotenv from 'dotenv';
dotenv.config();

import http from 'http';
import app from './app';
import { setupWebSocketServer } from './ws/collaboration';

const PORT = process.env.PORT || 3000;

const server = http.createServer(app);
setupWebSocketServer(server);

server.listen(PORT, () => {
  console.log(`RecipeSync server running on port ${PORT}`);
});
```

**Step 3: Write collaboration integration test**

Create `server/src/__tests__/collaboration.test.ts`:

```typescript
import http from 'http';
import WebSocket from 'ws';
import * as Y from 'yjs';
import { encodeStateAsUpdate } from 'yjs';
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
});

afterAll(async () => {
  await db('recipes').del();
  await db('users').del();
  await db.destroy();
  server.close();
});

function connectClient(token: string, recipeId: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}/ws/recipe/${recipeId}?token=${token}`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
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
  });

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
    const update = encodeStateAsUpdate(doc);

    const receivedPromise = new Promise<Buffer>((resolve) => {
      ws2.on('message', (data: Buffer) => resolve(data));
    });

    ws1.send(update);

    const received = await receivedPromise;
    expect(received).toBeDefined();

    // Apply received update to a new doc and verify
    const doc2 = new Y.Doc();
    Y.applyUpdate(doc2, new Uint8Array(received));
    expect(doc2.getText('title').toString()).toBe('Hello from client 1');

    ws1.close();
    ws2.close();
  });

  it('rejects unauthenticated connections', async () => {
    const ws = new WebSocket(`ws://localhost:${port}/ws/recipe/${recipeId}?token=invalid`);
    const code = await new Promise<number>((resolve) => {
      ws.on('close', (code) => resolve(code));
    });
    expect(code).toBe(4001);
  });
});
```

**Step 4: Run tests**

```bash
cd server && npx jest --config jest.config.js src/__tests__/collaboration.test.ts --detectOpenHandles
```

Expected: PASS (3 tests)

**Step 5: Commit**

```bash
git add server/src/
git commit -m "feat: add WebSocket Yjs real-time collaboration server"
```

---

## Task 9: Redis Presence Service

**Files:**
- Create: `server/src/services/presence.ts`
- Create: `server/src/routes/presence.ts`
- Modify: `server/src/ws/collaboration.ts`
- Modify: `server/src/app.ts`

**Step 1: Create src/services/presence.ts**

```typescript
import { createClient } from 'redis';

const redis = createClient({ url: process.env.REDIS_URL });
redis.connect().catch(console.error);

const PRESENCE_TTL = 60; // seconds

export async function setPresence(recipeId: string, userId: string, field: string | null) {
  const key = `presence:${recipeId}`;
  await redis.hSet(key, userId, JSON.stringify({ field, timestamp: Date.now() }));
  await redis.expire(key, PRESENCE_TTL);
}

export async function removePresence(recipeId: string, userId: string) {
  await redis.hDel(`presence:${recipeId}`, userId);
}

export async function getPresence(recipeId: string): Promise<Record<string, { field: string | null; timestamp: number }>> {
  const raw = await redis.hGetAll(`presence:${recipeId}`);
  const result: Record<string, any> = {};
  for (const [userId, json] of Object.entries(raw)) {
    result[userId] = JSON.parse(json);
  }
  return result;
}

export { redis };
```

**Step 2: Create src/routes/presence.ts**

```typescript
import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { getPresence } from '../services/presence';

const router = Router({ mergeParams: true });
router.use(authenticate);

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const presence = await getPresence(req.params.id);
    res.json(presence);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
```

**Step 3: Update collaboration.ts to track presence**

Add to the WebSocket connection handler in `server/src/ws/collaboration.ts`, after establishing the connection:

```typescript
import { setPresence, removePresence } from '../services/presence';

// Inside the 'connection' handler, after room setup:
await setPresence(recipeId, payload.userId, null);

// Inside the 'close' handler:
await removePresence(ws.recipeId!, ws.userId!);
```

**Step 4: Wire presence route into app.ts**

```typescript
import presenceRoutes from './routes/presence';
app.use('/api/recipes/:id/presence', presenceRoutes);
```

**Step 5: Commit**

```bash
git add server/src/
git commit -m "feat: add Redis presence tracking for active collaborators"
```

---

## Task 10: React Native Project Scaffolding

**Files:**
- Create: `mobile/` (React Native project via CLI)

**Step 1: Initialize React Native project**

```bash
npx react-native init RecipeSyncMobile --template react-native-template-typescript --directory mobile
```

**Step 2: Install core dependencies**

```bash
cd mobile
npm install @react-navigation/native @react-navigation/native-stack react-native-screens react-native-safe-area-context
npm install @tanstack/react-query axios
npm install react-native-async-storage/async-storage
npm install yjs y-protocols
npm install react-native-image-picker
npm install react-native-gesture-handler react-native-reanimated
```

**Step 3: Clean up the generated App.tsx**

Replace `mobile/App.tsx` with:

```typescript
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NavigationContainer } from '@react-navigation/native';
import { AuthProvider } from './src/context/AuthContext';
import RootNavigator from './src/navigation/RootNavigator';

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <NavigationContainer>
          <RootNavigator />
        </NavigationContainer>
      </AuthProvider>
    </QueryClientProvider>
  );
}
```

**Step 4: Commit**

```bash
git add mobile/
git commit -m "feat: scaffold React Native project with navigation and React Query"
```

---

## Task 11: Auth Context & API Client

**Files:**
- Create: `mobile/src/api/client.ts`
- Create: `mobile/src/api/auth.ts`
- Create: `mobile/src/context/AuthContext.tsx`

**Step 1: Create src/api/client.ts**

```typescript
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = __DEV__ ? 'http://localhost:3000/api' : 'https://api.recipesync.com/api';

const client = axios.create({ baseURL: API_URL });

client.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      const refreshToken = await AsyncStorage.getItem('refresh_token');
      if (refreshToken) {
        try {
          const { data } = await axios.post(`${API_URL}/auth/refresh`, { refresh_token: refreshToken });
          await AsyncStorage.setItem('access_token', data.access_token);
          originalRequest.headers.Authorization = `Bearer ${data.access_token}`;
          return client(originalRequest);
        } catch {
          await AsyncStorage.multiRemove(['access_token', 'refresh_token']);
        }
      }
    }
    return Promise.reject(error);
  }
);

export default client;
```

**Step 2: Create src/api/auth.ts**

```typescript
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

export async function register(email: string, password: string, display_name: string): Promise<User> {
  const { data } = await client.post<AuthResponse>('/auth/register', { email, password, display_name });
  await storeTokens(data);
  return data.user;
}

export async function login(email: string, password: string): Promise<User> {
  const { data } = await client.post<AuthResponse>('/auth/login', { email, password });
  await storeTokens(data);
  return data.user;
}

export async function loginWithGoogle(id_token: string): Promise<User> {
  const { data } = await client.post<AuthResponse>('/auth/google', { id_token });
  await storeTokens(data);
  return data.user;
}

export async function loginWithApple(id_token: string, display_name?: string): Promise<User> {
  const { data } = await client.post<AuthResponse>('/auth/apple', { id_token, display_name });
  await storeTokens(data);
  return data.user;
}
```

**Step 3: Create src/context/AuthContext.tsx**

```typescript
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User } from '../api/auth';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  isLoading: true,
  setUser: () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem('user')
      .then((stored) => {
        if (stored) setUser(JSON.parse(stored));
      })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    if (user) {
      AsyncStorage.setItem('user', JSON.stringify(user));
    } else {
      AsyncStorage.removeItem('user');
    }
  }, [user]);

  const logout = async () => {
    await AsyncStorage.multiRemove(['access_token', 'refresh_token', 'user']);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, setUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
```

**Step 4: Commit**

```bash
git add mobile/src/
git commit -m "feat: add auth context, API client with token refresh"
```

---

## Task 12: Navigation & Auth Screens

**Files:**
- Create: `mobile/src/navigation/RootNavigator.tsx`
- Create: `mobile/src/screens/LoginScreen.tsx`
- Create: `mobile/src/screens/RegisterScreen.tsx`
- Create: `mobile/src/screens/HomeScreen.tsx`

**Step 1: Create src/navigation/RootNavigator.tsx**

```typescript
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { ActivityIndicator, View } from 'react-native';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import HomeScreen from '../screens/HomeScreen';
import RecipeEditorScreen from '../screens/RecipeEditorScreen';
import CollaboratorsScreen from '../screens/CollaboratorsScreen';
import ProfileScreen from '../screens/ProfileScreen';

export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  Home: undefined;
  RecipeEditor: { recipeId: string; mode: 'edit' | 'view' };
  Collaborators: { recipeId: string };
  Profile: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {user ? (
        <>
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="RecipeEditor" component={RecipeEditorScreen} />
          <Stack.Screen name="Collaborators" component={CollaboratorsScreen} />
          <Stack.Screen name="Profile" component={ProfileScreen} />
        </>
      ) : (
        <>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Register" component={RegisterScreen} />
        </>
      )}
    </Stack.Navigator>
  );
}
```

**Step 2: Create src/screens/LoginScreen.tsx**

```typescript
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../context/AuthContext';
import { login } from '../api/auth';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export default function LoginScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { setUser } = useAuth();

  const handleLogin = async () => {
    setLoading(true);
    try {
      const user = await login(email, password);
      setUser(user);
    } catch {
      Alert.alert('Error', 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>RecipeSync</Text>
      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'Signing in...' : 'Sign In'}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => navigation.navigate('Register')}>
        <Text style={styles.link}>Don't have an account? Sign up</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 32, fontWeight: 'bold', textAlign: 'center', marginBottom: 48 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 16 },
  button: { backgroundColor: '#FF6B35', borderRadius: 8, padding: 16, alignItems: 'center', marginBottom: 16 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  link: { textAlign: 'center', color: '#FF6B35', fontSize: 14 },
});
```

**Step 3: Create src/screens/RegisterScreen.tsx**

```typescript
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../context/AuthContext';
import { register } from '../api/auth';

type Props = NativeStackScreenProps<RootStackParamList, 'Register'>;

export default function RegisterScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const { setUser } = useAuth();

  const handleRegister = async () => {
    setLoading(true);
    try {
      const user = await register(email, password, displayName);
      setUser(user);
    } catch {
      Alert.alert('Error', 'Registration failed. Email may already be in use.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create Account</Text>
      <TextInput style={styles.input} placeholder="Display Name" value={displayName} onChangeText={setDisplayName} />
      <TextInput style={styles.input} placeholder="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      <TextInput style={styles.input} placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry />
      <TouchableOpacity style={styles.button} onPress={handleRegister} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'Creating...' : 'Create Account'}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text style={styles.link}>Already have an account? Sign in</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 28, fontWeight: 'bold', textAlign: 'center', marginBottom: 48 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 16 },
  button: { backgroundColor: '#FF6B35', borderRadius: 8, padding: 16, alignItems: 'center', marginBottom: 16 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  link: { textAlign: 'center', color: '#FF6B35', fontSize: 14 },
});
```

**Step 4: Create src/screens/HomeScreen.tsx (placeholder)**

```typescript
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Home — Recipe List</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 24 },
});
```

**Step 5: Create placeholder screens for RecipeEditor, Collaborators, Profile**

Create `mobile/src/screens/RecipeEditorScreen.tsx`:

```typescript
import React from 'react';
import { View, Text } from 'react-native';

export default function RecipeEditorScreen() {
  return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><Text>Recipe Editor</Text></View>;
}
```

Create `mobile/src/screens/CollaboratorsScreen.tsx`:

```typescript
import React from 'react';
import { View, Text } from 'react-native';

export default function CollaboratorsScreen() {
  return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><Text>Collaborators</Text></View>;
}
```

Create `mobile/src/screens/ProfileScreen.tsx`:

```typescript
import React from 'react';
import { View, Text } from 'react-native';

export default function ProfileScreen() {
  return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><Text>Profile</Text></View>;
}
```

**Step 6: Commit**

```bash
git add mobile/src/
git commit -m "feat: add navigation stack with login, register, and placeholder screens"
```

---

## Task 13: Home Screen — Recipe List

**Files:**
- Create: `mobile/src/api/recipes.ts`
- Modify: `mobile/src/screens/HomeScreen.tsx`

**Step 1: Create src/api/recipes.ts**

```typescript
import client from './client';

export interface Recipe {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  servings: number | null;
  difficulty: 'easy' | 'medium' | 'hard' | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export async function getRecipes(): Promise<Recipe[]> {
  const { data } = await client.get<Recipe[]>('/recipes');
  return data;
}

export async function createRecipe(title: string, description?: string): Promise<Recipe> {
  const { data } = await client.post<Recipe>('/recipes', { title, description });
  return data;
}

export async function deleteRecipe(id: string): Promise<void> {
  await client.delete(`/recipes/${id}`);
}
```

**Step 2: Implement HomeScreen.tsx**

```typescript
import React, { useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput, Alert, RefreshControl,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { getRecipes, createRecipe, deleteRecipe, Recipe } from '../api/recipes';
import { useAuth } from '../context/AuthContext';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export default function HomeScreen({ navigation }: Props) {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const [newTitle, setNewTitle] = useState('');

  const { data: recipes, isLoading, refetch } = useQuery({
    queryKey: ['recipes'],
    queryFn: getRecipes,
  });

  const createMutation = useMutation({
    mutationFn: (title: string) => createRecipe(title),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      setNewTitle('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteRecipe,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recipes'] }),
  });

  const handleDelete = (id: string) => {
    Alert.alert('Delete Recipe', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate(id) },
    ]);
  };

  const renderRecipe = ({ item }: { item: Recipe }) => (
    <TouchableOpacity
      style={styles.recipeCard}
      onPress={() => navigation.navigate('RecipeEditor', { recipeId: item.id, mode: 'edit' })}
      onLongPress={() => handleDelete(item.id)}
    >
      <Text style={styles.recipeTitle}>{item.title}</Text>
      {item.description && <Text style={styles.recipeDesc}>{item.description}</Text>}
      {item.difficulty && <Text style={styles.badge}>{item.difficulty}</Text>}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>My Recipes</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Profile')}>
          <Text style={styles.profileLink}>{user?.display_name}</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.createRow}>
        <TextInput
          style={styles.input}
          placeholder="New recipe name..."
          value={newTitle}
          onChangeText={setNewTitle}
        />
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => newTitle.trim() && createMutation.mutate(newTitle.trim())}
        >
          <Text style={styles.addButtonText}>+</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={recipes}
        keyExtractor={(item) => item.id}
        renderItem={renderRecipe}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: 60 },
  title: { fontSize: 28, fontWeight: 'bold' },
  profileLink: { fontSize: 14, color: '#FF6B35' },
  createRow: { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 8 },
  input: { flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 16, marginRight: 8 },
  addButton: { backgroundColor: '#FF6B35', borderRadius: 8, width: 48, justifyContent: 'center', alignItems: 'center' },
  addButtonText: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  list: { padding: 16 },
  recipeCard: { backgroundColor: '#f9f9f9', borderRadius: 12, padding: 16, marginBottom: 12 },
  recipeTitle: { fontSize: 18, fontWeight: '600' },
  recipeDesc: { fontSize: 14, color: '#666', marginTop: 4 },
  badge: { fontSize: 12, color: '#FF6B35', marginTop: 8, textTransform: 'capitalize' },
});
```

**Step 3: Commit**

```bash
git add mobile/src/
git commit -m "feat: add home screen with recipe list, create, and delete"
```

---

## Task 14: Recipe Editor with Yjs Integration

**Files:**
- Create: `mobile/src/hooks/useYjsCollaboration.ts`
- Modify: `mobile/src/screens/RecipeEditorScreen.tsx`

**Step 1: Create src/hooks/useYjsCollaboration.ts**

```typescript
import { useEffect, useRef, useState, useCallback } from 'react';
import * as Y from 'yjs';
import AsyncStorage from '@react-native-async-storage/async-storage';

const WS_URL = __DEV__ ? 'ws://localhost:3000' : 'wss://api.recipesync.com';

export function useYjsCollaboration(recipeId: string) {
  const docRef = useRef(new Y.Doc());
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    const doc = docRef.current;
    let ws: WebSocket;

    const connect = async () => {
      const token = await AsyncStorage.getItem('access_token');
      if (!token) return;

      ws = new WebSocket(`${WS_URL}/ws/recipe/${recipeId}?token=${token}`);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);

      ws.onmessage = (event) => {
        const update = new Uint8Array(event.data);
        Y.applyUpdate(doc, update);
        setSynced(true);
      };

      ws.onclose = () => {
        setConnected(false);
        // Reconnect after 2 seconds
        setTimeout(connect, 2000);
      };

      ws.onerror = () => ws.close();
    };

    // Send local updates to server
    const updateHandler = (update: Uint8Array, origin: any) => {
      if (origin !== 'remote' && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(update);
      }
    };

    doc.on('update', updateHandler);
    connect();

    return () => {
      doc.off('update', updateHandler);
      wsRef.current?.close();
    };
  }, [recipeId]);

  const getMap = useCallback((name: string) => docRef.current.getMap(name), []);
  const getText = useCallback((name: string) => docRef.current.getText(name), []);
  const getArray = useCallback((name: string) => docRef.current.getArray(name), []);

  return { doc: docRef.current, connected, synced, getMap, getText, getArray };
}
```

**Step 2: Implement RecipeEditorScreen.tsx**

```typescript
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet, Alert,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { useYjsCollaboration } from '../hooks/useYjsCollaboration';
import * as Y from 'yjs';

type Props = NativeStackScreenProps<RootStackParamList, 'RecipeEditor'>;

export default function RecipeEditorScreen({ route, navigation }: Props) {
  const { recipeId, mode } = route.params;
  const { doc, connected, synced, getText, getArray } = useYjsCollaboration(recipeId);
  const isReadOnly = mode === 'view';

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [ingredients, setIngredients] = useState<{ name: string; quantity: string; unit: string }[]>([]);
  const [steps, setSteps] = useState<{ instruction: string }[]>([]);

  // Sync from Yjs doc to local state
  useEffect(() => {
    if (!synced) return;

    const titleText = getText('title');
    const descText = getText('description');
    const ingredientsArray = getArray('ingredients');
    const stepsArray = getArray('steps');

    setTitle(titleText.toString());
    setDescription(descText.toString());
    setIngredients(ingredientsArray.toArray() as any[]);
    setSteps(stepsArray.toArray() as any[]);

    const observer = () => {
      setTitle(titleText.toString());
      setDescription(descText.toString());
      setIngredients(ingredientsArray.toArray() as any[]);
      setSteps(stepsArray.toArray() as any[]);
    };

    titleText.observe(observer);
    descText.observe(observer);
    ingredientsArray.observe(observer);
    stepsArray.observe(observer);

    return () => {
      titleText.unobserve(observer);
      descText.unobserve(observer);
      ingredientsArray.unobserve(observer);
      stepsArray.unobserve(observer);
    };
  }, [synced]);

  const updateTitle = useCallback((text: string) => {
    const yTitle = getText('title');
    doc.transact(() => {
      yTitle.delete(0, yTitle.length);
      yTitle.insert(0, text);
    });
    setTitle(text);
  }, [doc]);

  const updateDescription = useCallback((text: string) => {
    const yDesc = getText('description');
    doc.transact(() => {
      yDesc.delete(0, yDesc.length);
      yDesc.insert(0, text);
    });
    setDescription(text);
  }, [doc]);

  const addIngredient = useCallback(() => {
    const yIngredients = getArray('ingredients');
    yIngredients.push([{ name: '', quantity: '', unit: '' }]);
  }, [doc]);

  const addStep = useCallback(() => {
    const ySteps = getArray('steps');
    ySteps.push([{ instruction: '' }]);
  }, [doc]);

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>Back</Text>
        </TouchableOpacity>
        <View style={styles.statusRow}>
          <View style={[styles.dot, { backgroundColor: connected ? '#4CAF50' : '#F44336' }]} />
          <Text style={styles.statusText}>{connected ? 'Connected' : 'Reconnecting...'}</Text>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('Collaborators', { recipeId })}>
          <Text style={styles.collabLink}>Collaborators</Text>
        </TouchableOpacity>
      </View>

      {!synced ? (
        <Text style={styles.loading}>Loading recipe...</Text>
      ) : (
        <>
          <TextInput
            style={styles.titleInput}
            value={title}
            onChangeText={updateTitle}
            placeholder="Recipe Title"
            editable={!isReadOnly}
          />
          <TextInput
            style={styles.descInput}
            value={description}
            onChangeText={updateDescription}
            placeholder="Description"
            multiline
            editable={!isReadOnly}
          />

          <Text style={styles.sectionTitle}>Ingredients</Text>
          {ingredients.map((ing, i) => (
            <View key={i} style={styles.ingredientRow}>
              <TextInput style={styles.ingQuantity} value={ing.quantity} placeholder="Qty" editable={!isReadOnly} />
              <TextInput style={styles.ingUnit} value={ing.unit} placeholder="Unit" editable={!isReadOnly} />
              <TextInput style={styles.ingName} value={ing.name} placeholder="Ingredient" editable={!isReadOnly} />
            </View>
          ))}
          {!isReadOnly && (
            <TouchableOpacity style={styles.addButton} onPress={addIngredient}>
              <Text style={styles.addButtonText}>+ Add Ingredient</Text>
            </TouchableOpacity>
          )}

          <Text style={styles.sectionTitle}>Steps</Text>
          {steps.map((step, i) => (
            <View key={i} style={styles.stepRow}>
              <Text style={styles.stepNumber}>{i + 1}.</Text>
              <TextInput
                style={styles.stepInput}
                value={step.instruction}
                placeholder="Describe this step..."
                multiline
                editable={!isReadOnly}
              />
            </View>
          ))}
          {!isReadOnly && (
            <TouchableOpacity style={styles.addButton} onPress={addStep}>
              <Text style={styles.addButtonText}>+ Add Step</Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: 60 },
  back: { color: '#FF6B35', fontSize: 16 },
  statusRow: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  statusText: { fontSize: 12, color: '#666' },
  collabLink: { color: '#FF6B35', fontSize: 14 },
  loading: { textAlign: 'center', marginTop: 40, color: '#999' },
  titleInput: { fontSize: 28, fontWeight: 'bold', paddingHorizontal: 16, marginBottom: 8 },
  descInput: { fontSize: 16, color: '#666', paddingHorizontal: 16, marginBottom: 24, minHeight: 60 },
  sectionTitle: { fontSize: 20, fontWeight: '600', paddingHorizontal: 16, marginTop: 16, marginBottom: 8 },
  ingredientRow: { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 8 },
  ingQuantity: { width: 60, borderWidth: 1, borderColor: '#ddd', borderRadius: 6, padding: 8, marginRight: 8 },
  ingUnit: { width: 70, borderWidth: 1, borderColor: '#ddd', borderRadius: 6, padding: 8, marginRight: 8 },
  ingName: { flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 6, padding: 8 },
  stepRow: { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 12 },
  stepNumber: { fontSize: 16, fontWeight: '600', marginRight: 8, marginTop: 8 },
  stepInput: { flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 6, padding: 8, minHeight: 60 },
  addButton: { marginHorizontal: 16, padding: 12, borderWidth: 1, borderColor: '#FF6B35', borderRadius: 8, alignItems: 'center', marginTop: 8, marginBottom: 24 },
  addButtonText: { color: '#FF6B35', fontWeight: '600' },
});
```

**Step 3: Commit**

```bash
git add mobile/src/
git commit -m "feat: add recipe editor with Yjs real-time collaboration"
```

---

## Task 15: Collaborators Screen

**Files:**
- Create: `mobile/src/api/collaborators.ts`
- Modify: `mobile/src/screens/CollaboratorsScreen.tsx`

**Step 1: Create src/api/collaborators.ts**

```typescript
import client from './client';

export interface Collaborator {
  recipe_id: string;
  user_id: string;
  role: 'editor' | 'viewer';
  email: string;
  display_name: string;
  avatar_url: string | null;
}

export async function getCollaborators(recipeId: string): Promise<Collaborator[]> {
  const { data } = await client.get<Collaborator[]>(`/recipes/${recipeId}/collaborators`);
  return data;
}

export async function inviteCollaborator(recipeId: string, email: string, role: string = 'editor') {
  const { data } = await client.post(`/recipes/${recipeId}/collaborators`, { email, role });
  return data;
}

export async function updateCollaboratorRole(recipeId: string, userId: string, role: string) {
  const { data } = await client.put(`/recipes/${recipeId}/collaborators/${userId}`, { role });
  return data;
}

export async function removeCollaborator(recipeId: string, userId: string) {
  await client.delete(`/recipes/${recipeId}/collaborators/${userId}`);
}
```

**Step 2: Implement CollaboratorsScreen.tsx**

```typescript
import React, { useState } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet, Alert,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import {
  getCollaborators, inviteCollaborator, removeCollaborator, updateCollaboratorRole, Collaborator,
} from '../api/collaborators';

type Props = NativeStackScreenProps<RootStackParamList, 'Collaborators'>;

export default function CollaboratorsScreen({ route, navigation }: Props) {
  const { recipeId } = route.params;
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');

  const { data: collaborators } = useQuery({
    queryKey: ['collaborators', recipeId],
    queryFn: () => getCollaborators(recipeId),
  });

  const inviteMutation = useMutation({
    mutationFn: (email: string) => inviteCollaborator(recipeId, email),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collaborators', recipeId] });
      setEmail('');
    },
    onError: () => Alert.alert('Error', 'Could not invite user. Make sure they have an account.'),
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => removeCollaborator(recipeId, userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['collaborators', recipeId] }),
  });

  const toggleRole = useMutation({
    mutationFn: (collab: Collaborator) =>
      updateCollaboratorRole(recipeId, collab.user_id, collab.role === 'editor' ? 'viewer' : 'editor'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['collaborators', recipeId] }),
  });

  const renderCollab = ({ item }: { item: Collaborator }) => (
    <View style={styles.collabRow}>
      <View style={styles.collabInfo}>
        <Text style={styles.collabName}>{item.display_name}</Text>
        <Text style={styles.collabEmail}>{item.email}</Text>
      </View>
      <TouchableOpacity onPress={() => toggleRole.mutate(item)}>
        <Text style={styles.roleBadge}>{item.role}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => removeMutation.mutate(item.user_id)}>
        <Text style={styles.removeButton}>Remove</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Collaborators</Text>
        <View style={{ width: 40 }} />
      </View>
      <View style={styles.inviteRow}>
        <TextInput
          style={styles.input}
          placeholder="Invite by email..."
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TouchableOpacity
          style={styles.inviteButton}
          onPress={() => email.trim() && inviteMutation.mutate(email.trim())}
        >
          <Text style={styles.inviteButtonText}>Invite</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={collaborators}
        keyExtractor={(item) => item.user_id}
        renderItem={renderCollab}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: 60 },
  back: { color: '#FF6B35', fontSize: 16 },
  title: { fontSize: 20, fontWeight: 'bold' },
  inviteRow: { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 16 },
  input: { flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginRight: 8 },
  inviteButton: { backgroundColor: '#FF6B35', borderRadius: 8, paddingHorizontal: 20, justifyContent: 'center' },
  inviteButtonText: { color: '#fff', fontWeight: '600' },
  list: { padding: 16 },
  collabRow: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#f9f9f9', borderRadius: 8, marginBottom: 8 },
  collabInfo: { flex: 1 },
  collabName: { fontSize: 16, fontWeight: '600' },
  collabEmail: { fontSize: 12, color: '#666' },
  roleBadge: { fontSize: 12, color: '#FF6B35', fontWeight: '600', marginRight: 12, textTransform: 'capitalize' },
  removeButton: { fontSize: 12, color: '#F44336' },
});
```

**Step 3: Commit**

```bash
git add mobile/src/
git commit -m "feat: add collaborators screen with invite, role toggle, and remove"
```

---

## Task 16: Profile Screen

**Files:**
- Modify: `mobile/src/screens/ProfileScreen.tsx`

**Step 1: Implement ProfileScreen.tsx**

```typescript
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { useAuth } from '../context/AuthContext';

type Props = NativeStackScreenProps<RootStackParamList, 'Profile'>;

export default function ProfileScreen({ navigation }: Props) {
  const { user, logout } = useAuth();

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Profile</Text>
        <View style={{ width: 40 }} />
      </View>
      <View style={styles.card}>
        <Text style={styles.name}>{user?.display_name}</Text>
        <Text style={styles.email}>{user?.email}</Text>
        <Text style={styles.provider}>Signed in via {user?.auth_provider}</Text>
      </View>
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: 60 },
  back: { color: '#FF6B35', fontSize: 16 },
  title: { fontSize: 20, fontWeight: 'bold' },
  card: { margin: 16, padding: 24, backgroundColor: '#f9f9f9', borderRadius: 12, alignItems: 'center' },
  name: { fontSize: 24, fontWeight: 'bold', marginBottom: 8 },
  email: { fontSize: 16, color: '#666', marginBottom: 4 },
  provider: { fontSize: 12, color: '#999', textTransform: 'capitalize' },
  logoutButton: { margin: 16, padding: 16, backgroundColor: '#F44336', borderRadius: 8, alignItems: 'center' },
  logoutText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
```

**Step 2: Commit**

```bash
git add mobile/src/
git commit -m "feat: add profile screen with logout"
```

---

## Task 17: Presence Bar Component

**Files:**
- Create: `mobile/src/hooks/usePresence.ts`
- Create: `mobile/src/components/PresenceBar.tsx`
- Modify: `mobile/src/screens/RecipeEditorScreen.tsx`

**Step 1: Create src/hooks/usePresence.ts**

```typescript
import { useState, useEffect } from 'react';
import client from '../api/client';

interface PresenceEntry {
  field: string | null;
  timestamp: number;
}

export function usePresence(recipeId: string) {
  const [presence, setPresence] = useState<Record<string, PresenceEntry>>({});

  useEffect(() => {
    const poll = async () => {
      try {
        const { data } = await client.get(`/recipes/${recipeId}/presence`);
        setPresence(data);
      } catch { /* ignore */ }
    };

    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [recipeId]);

  return presence;
}
```

**Step 2: Create src/components/PresenceBar.tsx**

```typescript
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const COLORS = ['#FF6B35', '#4CAF50', '#2196F3', '#9C27B0', '#FF9800'];

interface Props {
  userIds: string[];
}

export default function PresenceBar({ userIds }: Props) {
  if (userIds.length === 0) return null;

  return (
    <View style={styles.container}>
      {userIds.map((id, i) => (
        <View key={id} style={[styles.avatar, { backgroundColor: COLORS[i % COLORS.length] }]}>
          <Text style={styles.avatarText}>{id.slice(0, 2).toUpperCase()}</Text>
        </View>
      ))}
      <Text style={styles.label}>{userIds.length} editing</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  avatar: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: -6, borderWidth: 2, borderColor: '#fff' },
  avatarText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  label: { marginLeft: 14, fontSize: 12, color: '#666' },
});
```

**Step 3: Add PresenceBar to RecipeEditorScreen**

Import and add below the header in `RecipeEditorScreen.tsx`:

```typescript
import PresenceBar from '../components/PresenceBar';
import { usePresence } from '../hooks/usePresence';

// Inside the component:
const presence = usePresence(recipeId);

// In the JSX, after the header View:
<PresenceBar userIds={Object.keys(presence)} />
```

**Step 4: Commit**

```bash
git add mobile/src/
git commit -m "feat: add presence bar showing active collaborators"
```

---

## Task 18: Image Upload in Recipe Steps

**Files:**
- Create: `mobile/src/api/images.ts`
- Modify: `mobile/src/screens/RecipeEditorScreen.tsx`

**Step 1: Create src/api/images.ts**

```typescript
import client from './client';

export async function uploadStepImage(recipeId: string, imageUri: string): Promise<{ url: string; image_id: string }> {
  const formData = new FormData();
  formData.append('image', {
    uri: imageUri,
    type: 'image/jpeg',
    name: 'step-image.jpg',
  } as any);

  const { data } = await client.post(`/recipes/${recipeId}/images`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

  return data;
}
```

**Step 2: Add image picker to step rows in RecipeEditorScreen**

Add to the step rendering section:

```typescript
import { launchImageLibrary } from 'react-native-image-picker';
import { uploadStepImage } from '../api/images';
import { Image } from 'react-native';

// Inside step map, after the TextInput:
<TouchableOpacity
  onPress={async () => {
    const result = await launchImageLibrary({ mediaType: 'photo', quality: 0.8 });
    if (result.assets?.[0]?.uri) {
      try {
        const { url } = await uploadStepImage(recipeId, result.assets[0].uri);
        // Update step image in Yjs
        const ySteps = getArray('steps');
        const step = ySteps.get(i) as any;
        if (step) {
          doc.transact(() => {
            ySteps.delete(i, 1);
            ySteps.insert(i, [{ ...step, image_url: url }]);
          });
        }
      } catch {
        Alert.alert('Error', 'Failed to upload image');
      }
    }
  }}
>
  <Text style={{ color: '#FF6B35', fontSize: 12 }}>Add Photo</Text>
</TouchableOpacity>

{step.image_url && (
  <Image source={{ uri: step.image_url }} style={{ width: '100%', height: 200, borderRadius: 8, marginTop: 8 }} />
)}
```

**Step 3: Commit**

```bash
git add mobile/src/
git commit -m "feat: add image upload for recipe steps via Cloudinary"
```

---

## Summary

| Task | Description | Estimated Steps |
|------|-------------|----------------|
| 1 | Backend scaffolding | 11 |
| 2 | Database migrations | 9 |
| 3 | Email/password auth | 7 |
| 4 | Social login (Google + Apple) | 6 |
| 5 | Recipe CRUD API | 6 |
| 6 | Collaborator management API | 6 |
| 7 | Image upload via Cloudinary | 6 |
| 8 | WebSocket + Yjs collaboration | 5 |
| 9 | Redis presence service | 5 |
| 10 | React Native scaffolding | 4 |
| 11 | Auth context & API client | 4 |
| 12 | Navigation & auth screens | 6 |
| 13 | Home screen — recipe list | 3 |
| 14 | Recipe editor with Yjs | 3 |
| 15 | Collaborators screen | 3 |
| 16 | Profile screen | 2 |
| 17 | Presence bar component | 4 |
| 18 | Image upload in steps | 3 |
| **Total** | | **93 steps** |

**Dependency order:** Tasks 1-9 (backend) can be built sequentially. Tasks 10-18 (mobile) depend on the backend being complete. Within the backend, tasks must go in order (1→2→3→...→9). Within mobile, tasks 10-12 must go first, then 13-18 can be done in any order.
