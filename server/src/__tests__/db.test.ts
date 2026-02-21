import db from '../db/connection';

beforeAll(async () => {
  await db.migrate.latest();
});

afterAll(async () => {
  await db.destroy();
});

describe('Database migrations', () => {
  it('creates all tables', async () => {
    const tables = await db.raw("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'knex%' AND name NOT LIKE 'sqlite%'");
    const tableNames = tables.map((t: any) => t.name).sort();
    expect(tableNames).toEqual(['ingredients', 'recipe_collaborators', 'recipes', 'steps', 'users']);
  });

  it('can insert and query a user', async () => {
    const [user] = await db('users')
      .insert({
        email: 'db-test@example.com',
        display_name: 'DB Test',
        auth_provider: 'local',
      })
      .returning('*');

    expect(user.email).toBe('db-test@example.com');
    expect(user.id).toBeDefined();

    // Clean up
    await db('users').where({ email: 'db-test@example.com' }).del();
  });
});
