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
