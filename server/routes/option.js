const debug   = require("debug")("api:surveys"),
      express = require("express"),
      _       = require("lodash");

const config = require("../../config");

const router = express.Router();

/**
 * GET: Retrieves list of system options
 */
router.route('/system')
.get(async (req, res) => {
    debug(`GET: /options/system?${JSON.stringify(req.query)} ;`);

    try {
        let query = config.knex("options")
        .where("type","SYSTEM")
        .andWhere("is_deleted", false)

        if(req.query.string){
            query = query.andWhere(function() {
                this.orWhere("description","like",`%${req.query.string}%`)
                .orWhere("value","like",`%${req.query.string}%`)
            });
        }

        let options = await query;

        return res.status(200).send(options);
    } catch(error) {
        debug(error);
        return res.status(400).send(error);
    }
});

/**
 * GET: Retrieves list of custom options
 */
router.route('/custom')
.get(async (req, res) => {
    debug(`GET: /options/custom?${JSON.stringify(req.query)} ;`);

    try {
        let query = config.knex("options")
        .where("type","SYSTEM")
        .andWhere("is_deleted", false)

        if(req.query.surveyid){
            query = query.andWhere("survey_id",req.query.surveyid);
        }

        if(req.query.string){
            query = query.andWhere(function() {
                this.orWhere("description","like",`%${req.query.string}%`)
                .orWhere("value","like",`%${req.query.string}%`)
            });
        }

        let options = await query;

        return res.status(200).send(options);
    } catch(error) {
        debug(error);
        return res.status(400).send(error);
    }
});

module.exports = router;