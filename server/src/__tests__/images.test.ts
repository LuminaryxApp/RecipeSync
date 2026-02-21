import request from 'supertest';
import app from '../app';
import db from '../db/connection';
import { generateTokens } from '../middleware/auth';

jest.mock('../config/cloudinary', () => ({
  __esModule: true,
  default: {
    uploader: {
      upload_stream: jest.fn((_opts: any, callback: any) => {
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
