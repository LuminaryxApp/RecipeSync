import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw("(lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))))"));
    table.string('email').unique().notNullable();
    table.string('password_hash').nullable();
    table.string('display_name').notNullable();
    table.string('avatar_url').nullable();
    table.string('auth_provider').notNullable().defaultTo('local');
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('recipes', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw("(lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))))"));
    table.uuid('owner_id').references('id').inTable('users').onDelete('CASCADE').notNullable();
    table.string('title').notNullable();
    table.text('description').nullable();
    table.integer('prep_time_minutes').nullable();
    table.integer('cook_time_minutes').nullable();
    table.integer('servings').nullable();
    table.string('difficulty').nullable();
    table.text('tags').defaultTo('[]');
    table.text('nutritional_info').nullable();
    table.binary('yjs_document').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('ingredients', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw("(lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))))"));
    table.uuid('recipe_id').references('id').inTable('recipes').onDelete('CASCADE').notNullable();
    table.string('name').notNullable();
    table.decimal('quantity', 10, 3).nullable();
    table.string('unit').nullable();
    table.integer('order_index').notNullable().defaultTo(0);
  });

  await knex.schema.createTable('steps', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw("(lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))))"));
    table.uuid('recipe_id').references('id').inTable('recipes').onDelete('CASCADE').notNullable();
    table.text('instruction').notNullable();
    table.string('image_url').nullable();
    table.integer('order_index').notNullable().defaultTo(0);
  });

  await knex.schema.createTable('recipe_collaborators', (table) => {
    table.uuid('recipe_id').references('id').inTable('recipes').onDelete('CASCADE').notNullable();
    table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE').notNullable();
    table.string('role').notNullable().defaultTo('editor');
    table.timestamp('invited_at').defaultTo(knex.fn.now());
    table.primary(['recipe_id', 'user_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('recipe_collaborators');
  await knex.schema.dropTableIfExists('steps');
  await knex.schema.dropTableIfExists('ingredients');
  await knex.schema.dropTableIfExists('recipes');
  await knex.schema.dropTableIfExists('users');
}
