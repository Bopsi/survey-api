const debug = require("debug")("api:migration:seed");
const config = require("../config");
const knex = config.knex;

const users = require("./data/users.json"),
    surveys = require("./data/surveys.json"),
    questions = require("./data/questions.json"),
    options = require("./data/options.json"),
    questionOptions = require("./data/question_option.json")


async function seed() {
    await knex("users").insert(users);
    await knex("surveys").insert(surveys);
    await knex("surveys").update({
        locked_at: knex.fn.now(6)
    }).where({
        status: "LOCKED"
    });
    await knex("questions").insert(questions);
    await knex("options").insert(options);
    await knex("question_option").insert(questionOptions);
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