const debug = require("debug")("api:migration:seed");
const config = require("../config");
const knex = config.knex;

const users = require("./data/users.json"),
    surveys = require("./data/surveys.json");


async function seed() {
    await knex("users").insert(users);
    await knex("surveys").insert(surveys);
}

seed()
    .then(res => {
        debug("Seed Sucess");
        process.exit();
    })
    .catch(error => {
        debug("Seed Error");
        debug("%O", error);
        process.exit();
    });