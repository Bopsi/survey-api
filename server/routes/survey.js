const debug = require("debug")("api:surveys"),
    express = require("express");

const config = require("../../config");

const router = express.Router();

router.route('/')
    .post(async (req, res) => {
        debug("POST: /surveys - %j ;", req.body);

        if (!req.user.id) {
            return res.status(403).send({
                message: 'Unauthorized'
            });
        }

        if (!req.body.name) {
            return res.status(400).send({
                message: 'Some values are missing'
            });
        }

        try {
            const surveys = await config.knex("surveys").where({
                name: req.body.name
            });

            if (surveys.length > 0) {
                return res.status(400).send({
                    message: 'Survey name exists'
                });
            }

            await config.knex("surveys").insert({
                name: req.body.name,
                description: req.body.description,
                version: 1,
                created_by: req.user.id
            })

            return res.status(201).send({
                message: 'Survey created'
            });
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

module.exports = router;