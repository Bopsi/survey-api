require("dotenv").config();

module.exports.HOST = process.env.HOST || "127.0.0.1";
module.exports.PORT = process.env.PORT || 3000;
module.exports.SECRET = process.env.SECRET;
module.exports.knex = require("knex")({
    client: process.env.DB_TYPE,
    connection: process.env.DB_URL,
});
module.exports.ADMIN_DOMAIN = process.env.ADMIN_DOMAIN;
module.exports.ADMIN_EMAILS = process.env.ADMIN_EMAILS;