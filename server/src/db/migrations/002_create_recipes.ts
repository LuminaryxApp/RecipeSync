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
