const debug = require("debug")("api:surveys"),
    express = require("express"),
    _ = require("lodash");

const config = require("../../config");

const router = express.Router();

router.route('/')
    .get(async (req, res) => {
        debug("GET: /surveys ;");

        if (!req.user.id || req.user.role !== 'ADMIN') {
            return res.status(403).send({
                message: 'Unauthorized'
            });
        }

        try {
            const surveys = await config.knex("surveys").orderBy("id");
            return res.status(200).send(surveys);
        } catch (error) {
            debug(error);
            return res.status(400).send(error);
        }
    })
    .post(async (req, res) => {
        debug("POST: /surveys - %j ;", req.body);

        if (!req.user.id || req.user.role !== 'ADMIN') {
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
            return res.status(500).send(error);
        }
    });


router.route('/:surveyid')
    .get(async (req, res) => {
        debug(`GET: /surveys/${req.params.surveyid} ;`);

        try {
            const rows = await config.knex("surveys as s")
                .leftJoin("questions as q", "s.id", "q.survey_id")
                .leftJoin("question_option as qo", "q.id", "qo.question_id")
                .leftJoin("options as o", "qo.option_id", "o.id")
                .where("s.id", req.params.surveyid)
                .select("s.id as id", "s.name as name", "s.description as description", "version", "status",
                    "s.created_at as created_at", "locked_at", "s.created_by as created_by", "q.id as question_id",
                    "q.description as question_description", "note", "mandatory", "q.type as question_type",
                    "attachments", "q.created_at as question_created_at", "o.id as option_id", "value",
                    "o.description as option_description", "o.type as option_type", "o.survey_id as option_survey_id")
                .orderBy("s.id", "q.id", "o.id");

            const surveys = [];
            let survey = {},
                question = {};

            rows.forEach(row => {
                if (row.id !== survey.id) {
                    survey = {
                        id: row.id,
                        name: row.name,
                        description: row.description,
                        version: row.version,
                        status: row.status,
                        created_at: row.created_at,
                        locked_at: row.locked_at,
                        created_by: row.created_by,
                        questions: []
                    }
                    surveys.push(survey);
                }

                if (row.question_id !== question.id) {
                    question = {
                        id: row.question_id,
                        description: row.question_description,
                        note: row.note,
                        mandatory: row.mandatory,
                        type: row.question_type,
                        attachments: row.attachments,
                        created_at: row.question_created_at,
                        options: []
                    }
                    survey.questions.push(question);
                }

                if (row.option_id) {
                    option = {
                        id: row.option_id,
                        value: row.value,
                        description: row.option_description,
                        type: row.option_type,
                        survey_id: row.option_survey_id
                    }
                    question.options.push(option);
                }
            });

            if (surveys.length > 0) {
                return res.status(200).send(surveys[0]);
            } else {
                return res.status(404).send({
                    message: "Survey not found"
                });
            }
        } catch (error) {
            debug(error);
            return res.status(500).send(error);
        }
    })
    .put(async (req, res) => {
        debug(`PUT: /surveys/${req.params.surveyid} ;`);
        try {

        } catch (error) {
            debug(error);
            return res.status(500).send(error);
        }
    })
    .delete(async (req, res) => {
        try {

        } catch (error) {
            debug(error);
            return res.status(500).send(error);
        }

    })


module.exports = router;