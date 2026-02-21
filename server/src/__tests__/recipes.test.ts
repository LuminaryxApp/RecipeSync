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
