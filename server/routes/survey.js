const debug   = require("debug")("api:surveys"),
      express = require("express"),
      _       = require("lodash");

const config = require("../../config");

const router = express.Router();

router.route('/')
.get(async (req, res) => {
    debug("GET: /surveys ;");

    if(!req.user.id || req.user.role !== 'ADMIN') {
        return res.status(403).send({
            message: 'Unauthorized'
        });
    }

    try {
        const surveys = await config.knex("surveys").orderBy("id");
        return res.status(200).send(surveys);
    } catch(error) {
        debug(error);
        return res.status(400).send(error);
    }
})
.post(async (req, res) => {
    debug("POST: /surveys - %j ;", req.body);

    if(!req.user.id || req.user.role !== 'ADMIN') {
        return res.status(403).send({
            message: 'Unauthorized'
        });
    }

    if(!req.body.name) {
        return res.status(400).send({
            message: 'Some values are missing'
        });
    }

    try {
        const surveys = await config.knex("surveys").where({
            name: req.body.name
        });

        if(surveys.length > 0) {
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
    } catch(error) {
        debug(error);
        return res.status(500).send(error);
    }
});


router.route('/:surveyid')
.get(async (req, res) => {
    debug(`GET: /surveys/${req.params.surveyid} ;`);
    const surveyid = req.params.surveyid;

    try {
        const questions =  config.knex("questions as q")
        .leftJoin("question_option as qo","q.id","qo.question_id")
        .leftJoin("options as o","qo.option_id","o.id")
        .select("q.*",config.knex.raw("to_json(array_remove(array_agg(o),NULL)) \"options\""))
        .groupBy("q.id");

        const surveys = await config.knex("surveys as s")
        .leftJoin(questions.as("q"),"s.id","q.survey_id")
        .select("s.*", config.knex.raw("to_json(array_remove(array_agg(q),NULL)) questions"))
        .where("s.id",surveyid)
        .groupBy("s.id");

        if(surveys.length > 0) {
            return res.status(200).send(surveys[0]);
        } else {
            return res.status(404).send({
                message: "Survey not found"
            });
        }
    } catch(error) {
        debug(error);
        return res.status(500).send(error);
    }
})
.put(async (req, res) => {
    debug(`PUT: /surveys/${req.params.surveyid} ;`);
    try {

    } catch(error) {
        debug(error);
        return res.status(500).send(error);
    }
})
.delete(async (req, res) => {
    try {

    } catch(error) {
        debug(error);
        return res.status(500).send(error);
    }

})


module.exports = router;