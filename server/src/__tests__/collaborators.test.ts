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
