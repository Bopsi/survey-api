const debug = require("debug")("api:users"),
    express = require("express");

const config = require("../../config"),
    Helper = require("../utils/Helper");

const router = express.Router();

router.post('/signup', async (req, res) => {
    debug("POST:/users/signup - %j ;", req.body);

    if (!req.body.email || !req.body.password || !req.body.first_name || !req.body.last_name) {
        return res.status(400).send({
            message: 'Some values are missing'
        });
    }
    if (!Helper.isValidEmail(req.body.email)) {
        return res.status(400).send({
            message: 'Please enter a valid email address'
        });
    }

    if (config.ADMIN_DOMAIN) {
        const domain = req.body.email.substring(req.body.email.lastIndexOf("@") + 1);
        if (domain === config.ADMIN_DOMAIN) {
            req.body.role = 'ADMIN';
        }
    } else {
        const emails = config.ADMIN_EMAILS.split(',');
        if (emails.includes(req.body.email)) {
            req.body.role = 'ADMIN';
        }
    }

    req.body.password = Helper.hashPassword(req.body.password);

    try {
        const rows = await config.knex("users").insert(req.body).returning("*");
        if (rows.length === 1) {
            return res.status(201).send({
                message: 'Signup complete'
            });
        } else {
            return res.status(500).send({
                message: 'Internal server error'
            });
        }
    } catch (error) {
        debug(error);
        if (error.routine === '_bt_check_unique') {
            return res.status(400).send({
                message: 'User with that EMAIL already exist'
            })
        }
        return res.status(400).send(error);
    }
});

router.post('/signin', async (req, res) => {
    debug("POST:/users/signin - %j ;", req.body);

    if (!req.body.email || !req.body.password) {
        return res.status(400).send({
            message: 'Some values are missing'
        });
    }
    if (!Helper.isValidEmail(req.body.email)) {
        return res.status(400).send({
            message: 'Please enter a valid email address'
        });
    }
    try {
        const rows = await config.knex("users").where("email", req.body.email);
        if (!rows[0]) {
            return res.status(400).send({
                message: 'The credentials you provided is incorrect'
            });
        }
        if (!Helper.comparePassword(rows[0].password, req.body.password)) {
            return res.status(400).send({
                message: 'The credentials you provided is incorrect'
            });
        }
        const token = Helper.generateToken(rows[0].id, rows[0].role);
        await config.knex("users").update({
            last_login: config.knex.fn.now(6)
        });
        return res.status(200).send({
            token: token,
            email: rows[0].first_name,
            first_name: rows[0].first_name,
            last_name: rows[0].first_name
        });
    } catch (error) {
        return res.status(400).send(error)
    }
});

module.exports = router;