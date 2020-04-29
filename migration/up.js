const debug = require("debug")("api:migration:up");
const config = require("../config");
const knex = config.knex;

async function up() {
    await knex.schema.createTable('users', (table) => {
        table.increments();
        table.string('first_name').notNullable();
        table.string('last_name');
        table.string('email').unique();
        table.string('password');
        table.enum('role', ['ADMIN', 'USER']).defaultTo('USER');
        table.timestamp('last_login').nullable();
    });
    await knex.schema.createTable('surveys', (table) => {
        table.increments();
        table.string('name').notNullable();
        table.string('description');
        table.integer('version').unsigned().notNullable();
        table.enum('status', ['UNLOCKED', 'LOCKED']).defaultTo('UNLOCKED');
        table.timestamp('created_at').defaultTo(knex.fn.now(6));
        table.timestamp('locked_at').nullable();
        table.integer('created_by').references('id').inTable('users');
        table.boolean('is_deleted').defaultTo(false);
        table.unique(['name', 'version']);
    });
    await knex.schema.createTable('questions', (table) => {
        table.increments();
        table.integer('survey_id').references('id').inTable('surveys');
        table.text('description').notNullable();
        table.text('note');
        table.boolean('mandatory').defaultTo(true);
        table.enum('type', ['TEXT', 'RADIO', 'CHECKBOX', 'NONE']).defaultTo('TEXT');
        table.boolean('attachments').defaultTo(false);
        table.boolean('is_deleted').defaultTo(false);
        table.timestamp('created_at').defaultTo(knex.fn.now(6));
        table.integer('index').unsigned().notNullable();
        table.unique(['survey_id', 'index']);
    });
    await knex.schema.createTable('options', (table) => {
        table.increments();
        table.string('value').notNullable();
        table.text('description').notNullable();
        table.enum('type', ['SYSTEM', 'CUSTOM']).defaultTo('CUSTOM');
        table.boolean('is_deleted').defaultTo(false);
        table.integer('survey_id').unsigned().nullable();
    });
    await knex.schema.createTable('question_option', (table) => {
        table.increments();
        table.integer('question_id').notNullable();
        table.integer('option_id').notNullable();
        table.boolean('is_deleted').defaultTo(false);
        table.integer('index').unsigned().notNullable();
        table.unique(['question_id', 'index']);
    });
}

up()
    .then(res => {
        debug("Migration Sucess");
        process.exit();
    })
    .catch(error => {
        debug("Migration Error");
        debug("%O", error);
        process.exit();
    });