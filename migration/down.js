const debug = require("debug")("api:migration:down");
const conf = require("../config");
const knex = conf.knex;

async function down() {
    await knex.schema.dropTable("answers");
    await knex.schema.dropTable("records");
    await knex.schema.dropTable("accesses");
    await knex.schema.dropTable("question_option");
    await knex.schema.dropTable("options");
    await knex.schema.dropTable("questions");
    await knex.schema.dropTable("surveys");
    await knex.schema.dropTable("users")
}

down()
    .then(res => {
        debug("Rollback Sucess");
        process.exit();
    })
    .catch(error => {
        debug("Rollback Error");
        debug("%O", error);
        process.exit();
    });