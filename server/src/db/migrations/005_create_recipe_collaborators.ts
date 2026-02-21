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
