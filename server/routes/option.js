const debug   = require("debug")("api:surveys"),
      express = require("express"),
      _       = require("lodash");

const config = require("../../config");

const router = express.Router();

/**
 * GET: Retrieves list of options
 */
router.route('/')
.get(async (req, res) => {
    debug(`GET: /options ;`);

    try {
        let options = await config.knex("options");

        return res.status(200).send(options);
    } catch(error) {
        debug(error);
        return res.status(400).send(error);
    }
});

/**
 * GET: Retrieves list of options
 */
router.route('/search')
.get(async (req, res) => {
    debug(`GET: /options/search?${JSON.stringify(req.query)} ;`);

    try {
        let options = await config.knex("options")
        .where("type","SYSTEM")
        .andWhere("is_deleted", false)
        .andWhere(function() {
            this.orWhere("description","like",`%${req.query.string}%`)
            .orWhere("value","like",`%${req.query.string}%`)
        });

        return res.status(200).send(options);
    } catch(error) {
        debug(error);
        return res.status(400).send(error);
    }
});

module.exports = router;