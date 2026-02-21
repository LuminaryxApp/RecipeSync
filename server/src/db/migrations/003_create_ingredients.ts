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
