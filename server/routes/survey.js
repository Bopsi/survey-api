const debug   = require("debug")("api:surveys"),
      express = require("express"),
      _       = require("lodash");

const config = require("../../config");

const router = express.Router();

/**
 * GET: Retrieves list of surveys
 * POST: Create new survey
 */
router.route('/')
.get(async (req, res) => {
    debug(`GET: /surveys?${JSON.stringify(req.query)} ;`);

    try {
        let surveysQuery = config.knex("surveys as s")
        .select("s.*");

        if(req.user.role === 'USER') {
            surveysQuery = surveysQuery
            .join("accesses as a", "s.id", "a.survey_id")
            .where("a.user_id", req.user.id)
            .andWhere("is_active", true);
        } else {
            if(!req.query.includeDeleted) {
                surveysQuery = surveysQuery.where("s.is_deleted", false);
            }
        }

        const surveys = await surveysQuery.orderBy("s.id");
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

        const ids = await config.knex("surveys").insert({
            name: req.body.name,
            description: req.body.description,
            version: 1,
            created_by: req.user.id
        })
        .returning("id");

        return res.status(201).send({id: ids[0]});
    } catch(error) {
        debug(error);
        return res.status(500).send(error);
    }
});

/**
 * GET: Retrieves a survey details
 * PUT: Modifies a survey (only description at the moment)
 * DELETE: Deletes a survey
 */
router.route('/:surveyid')
.get(async (req, res) => {
    debug(`GET: /surveys/${req.params.surveyid} ;`);
    const surveyid = req.params.surveyid;

    try {
        let surveysQuery = config.knex("surveys as s")
        .where("id", surveyid)
        .groupBy("id");

        if(req.user.role !== 'ADMIN') {
            surveysQuery = surveysQuery.andWhere("is_deleted", false);
        }

        const surveys = await surveysQuery;

        if(surveys.length > 0) {
            const survey = surveys[0];
            return res.status(200).send(survey);
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
    debug(`PUT: /surveys/${req.params.surveyid} - %j ;`, req.body);

    if(!req.user.id || req.user.role !== 'ADMIN') {
        return res.status(403).send({
            message: 'Unauthorized'
        });
    }

    try {
        const rows = await config.knex("surveys")
        .where("id", req.params.surveyid);

        if(rows.length === 0) {
            return res.status(404).send({
                message: 'Survey not found'
            });
        }

        if(rows[0].status === 'LOCKED') {
            return res.status(400).send({
                message: 'Locked survey cannot be modified'
            });
        }

        await config.knex("surveys").update({
            description: req.body.description
        })
        .where("id", req.params.surveyid);

        return res.status(200).send({});
    } catch(error) {
        debug(error);
        return res.status(500).send(error);
    }
})
.delete(async (req, res) => {
    debug(`DELETE: /surveys/${req.params.surveyid} - %j ;`, req.body);

    if(!req.user.id || req.user.role !== 'ADMIN') {
        return res.status(403).send({
            message: 'Unauthorized'
        });
    }

    try {
        const rows = await config.knex("surveys")
        .where("id", req.params.surveyid);

        if(rows.length === 0) {
            return res.status(404).send({
                message: 'Survey not found'
            });
        }

        await config.knex.transaction(async trx => {
            await config.knex("surveys").update({
                is_deleted: true
            })
            .where("id", req.params.surveyid)
            .transacting(trx);

            let ids = await config.knex("questions").update({
                is_deleted: true
            })
            .where("survey_id", req.params.surveyid)
            .returning("id")
            .transacting(trx);

            _.map("ids", (id) => {
                return id.id
            });

            await config.knex("question_option")
            .update({
                is_deleted: true
            })
            .whereIn("question_id", ids)
            .transacting(trx);

            await config.knex("options").update({
                is_deleted: true
            })
            .where("survey_id", req.params.surveyid)
            .transacting(trx);
        });

        return res.status(200).send({});
    } catch(error) {
        debug(error);
        return res.status(500).send(error);
    }

});

/**
 * Locks an unlocked survey
 */
router.post('/:surveyid/lock', async (req, res) => {
    debug(`POST: /surveys/${req.params.surveyid}/lock - %j ;`, req.body);

    if(!req.user.id || req.user.role !== 'ADMIN') {
        return res.status(403).send({
            message: 'Unauthorized'
        });
    }

    try {
        const rows = await config.knex("surveys")
        .where("id", req.params.surveyid);

        if(rows.length === 0) {
            return res.status(404).send({
                message: 'Survey not found'
            });
        }

        if(rows[0].status === 'LOCKED') {
            return res.status(400).send({
                message: 'Survey already locked'
            });
        }

        if(rows[0].is_deleted) {
            return res.status(400).send({
                message: 'Survey deleted'
            });
        }

        let surveys = [];

        await config.knex.transaction(async trx => {
            surveys = await config.knex("surveys").update({
                status: "LOCKED",
                locked_at: config.knex.fn.now(6)
            })
            .returning("*")
            .where("id", req.params.surveyid)
            .transacting(trx);

            await config.knex("accesses").insert({
                survey_id: req.params.surveyid,
                user_id: req.user.id
            })
            .transacting(trx);
        });

        if(surveys.length > 0) {
            return res.status(200).send(surveys[0]);
        } else {
            return res.status(500).send({
                message: 'Internal Server Error'
            });
        }
    } catch(error) {
        debug(error);
        return res.status(500).send({
            error: error,
            message: 'Internal Server Error'
        });
    }
});

/**
 * Creates a new version of survey from existing locked survey
 */
router.post('/:surveyid/version', async (req, res) => {
    debug(`POST: /surveys/${req.params.surveyid}/version - %j ;`, req.body);

    if(!req.user.id || req.user.role !== 'ADMIN') {
        return res.status(403).send({
            message: 'Unauthorized'
        });
    }

    try {
        const rows = await config.knex("surveys")
        .where("id", req.params.surveyid);

        if(rows.length === 0) {
            return res.status(404).send({
                message: 'Survey not found'
            });
        }

        if(rows[0].status === 'UNLOCKED') {
            return res.status(400).send({
                message: 'Unlocked survey cannot be versioned'
            });
        }
        const survey  = rows[0];
        let newSurvey = null;

        await config.knex.transaction(async trx => {
            let rows      = await config.knex("surveys")
            .max("version")
            .where("name", survey.name);
            const version = rows[0].max + 1;

            // Insert new survey
            let description = `Version ${version}: ${survey.description.trim()}`;
            if(req.body.description && req.body.description.trim() && req.body.description.trim() !== description) {
                description = req.body.description.trim();
            }
            rows      = await config.knex("surveys")
            .insert({
                name: survey.name,
                description: description,
                version: version,
                created_by: req.user.id
            })
            .returning("*")
            .transacting(trx);
            newSurvey = rows[0];

            // Fetch linked questions
            rows = await config.knex("questions")
            .select("id", config.knex.raw(`${newSurvey.id} as survey_id`), "description",
            "note", "mandatory", "type", "attachments", "index")
            .where("survey_id", survey.id)
            .andWhere("is_deleted", false);

            const qids   = [];
            const qidMap = {};
            const oids   = [];
            const oidMap = {};

            // If questions exists
            if(rows.length > 0) {
                rows.forEach(row => {
                    qids.push(row.id);
                    delete row.id;
                });

                // Insert questions
                let questionids = await config.knex("questions")
                .insert(rows)
                .returning("id")
                .transacting(trx);

                // Keep a Map
                questionids.forEach((questionid, i, obj) => {
                    qidMap[qids[i]] = questionid;
                });

                // Fetch linked options
                rows = await config.knex("options")
                .select("id", config.knex.raw(`${newSurvey.id} as survey_id`),
                "value", "description", "type")
                .where("survey_id", survey.id)
                .andWhere("type", "CUSTOM")
                .andWhere("is_deleted", false);

                // If custom options exists
                if(rows.length > 0) {
                    rows.forEach(row => {
                        oids.push(row.id);
                        delete row.id;
                    });

                    // Insert options
                    let optionids = await config.knex("options")
                    .insert(rows)
                    .returning("id")
                    .transacting(trx);

                    // Keep a Map
                    debug("New optionids %j ;", optionids);
                    optionids.forEach((optionid, i, obj) => {
                        oidMap[oids[i]] = optionid;
                    });
                }

                // Get old question option mapping
                rows    = await config.knex("question_option")
                .whereIn("question_id", qids)
                .andWhere("is_deleted", false);
                let qos = [];

                // Create new question option mapping
                rows.forEach(row => {
                    qos.push({
                        question_id: qidMap[row.question_id],
                        option_id: oidMap[row.option_id] || row.option_id,
                        index: row.index
                    });
                });

                // Insert new question option mapping
                await config.knex("question_option")
                .insert(qos)
                .transacting(trx);
            }
        });

        return res.status(200).send({
            id: newSurvey.id
        });
    } catch(error) {
        debug(error);
        return res.status(500).send({
            error: error,
            message: 'Internal Server Error'
        });
    }
});

/**
 * GET: Retrieves list of questions for a survey
 * POST: Creates a question for a survey
 */
router.route('/:surveyid/questions')
.get(async (req, res) => {
    debug(`GET: /surveys/${req.params.surveyid}/questions ;`);
    const surveyid = req.params.surveyid;

    try {
        const optionsQuery = config.knex("question_option as qo")
        .leftJoin("options as o", "qo.option_id", "o.id")
        .select("o.*", "qo.index", "qo.id as qo_id", "qo.question_id");

        const questionsQuery = config.knex("questions as q")
        .leftJoin(optionsQuery.as("o"), "q.id", "o.question_id")
        .select("q.*", config.knex.raw("to_json(array_remove(array_agg(o),NULL)) \"options\""))
        .groupBy("q.id")
        .where("q.survey_id", surveyid)
        .andWhere("q.is_deleted", false);

        let questions = await questionsQuery;

        questions = _.chain(questions)
        .sortBy("index")
        .map(function(question) {
            question.options = _.sortBy(question.options, "index");
            return question;
        });
        return res.status(200).send(questions);
    } catch(error) {
        debug(error);
        return res.status(500).send(error);
    }
})
.post(async (req, res) => {
    debug("POST: /:surveyid/questions", req.body);

    if(!req.user.id || req.user.role !== 'ADMIN') {
        return res.status(403).send({
            message: 'Unauthorized'
        });
    }

    if(!req.body.description) {
        return res.status(400).send({
            message: 'Some values are missing'
        });
    }

    try {
        const rows = await config.knex("surveys as s")
        .leftJoin("questions as q", "s.id", "q.survey_id")
        .select("s.*", config.knex.raw("max(index)+1 as max"))
        .where("s.id", req.params.surveyid)
        .groupBy("s.id");

        if(rows.length === 0) {
            return res.status(404).send({
                message: 'Survey not found'
            });
        }

        if(rows[0].id !== Number(req.params.surveyid)) {
            return res.status(400).send({
                message: 'Incorrect Survey'
            });
        }

        if(rows[0].status === 'LOCKED') {
            return res.status(400).send({
                message: 'Survey Locked'
            });
        }

        if(rows[0].is_deleted) {
            return res.status(400).send({
                message: 'Survey Deleted'
            });
        }

        const index = rows[0].max || 1;

        await config.knex("questions").insert({
            survey_id: req.params.surveyid,
            description: req.body.description,
            note: req.body.note,
            mandatory: req.body.mandatory,
            type: req.body.type,
            attachments: req.body.attachments,
            index: index
        });

        return res.status(200).send({});
    } catch(error) {
        debug(error);
        return res.status(500).send({
            error: error,
            message: 'Internal Server Error'
        });
    }
});

/**
 * GET: Retrieves a question by survey id and question id
 * PUT: Modifies a question
 * DELETE: Deletes a question
 */
router.route('/:surveyid/questions/:questionid')
.get(async (req, res) => {
    debug(`GET: /surveys/${req.params.surveyid}/questions/${req.params.questionid} ;`);

    const surveyid   = req.params.surveyid;
    const questionid = req.params.questionid;

    try {
        const optionsQuery = config.knex("question_option as qo")
        .leftJoin("options as o", "qo.option_id", "o.id")
        .select("o.*", "qo.index", "qo.id as qo_id", "qo.question_id");

        const questionsQuery = config.knex("questions as q")
        .leftJoin(optionsQuery.as("o"), "q.id", "o.question_id")
        .select("q.*", config.knex.raw("to_json(array_remove(array_agg(o),NULL)) \"options\""))
        .groupBy("q.id")
        .where("q.survey_id", surveyid)
        .andWhere("q.id", questionid);

        let questions = await questionsQuery;

        if(questions.length > 0) {
            const question   = questions[0];
            question.options = _.sortBy(question.options, "index");
            return res.status(200).send(question);
        } else {
            return res.status(404).send({
                message: "Question not found"
            });
        }
    } catch(error) {
        debug(error);
        return res.status(500).send(error);
    }
})
.put(async (req, res) => {

})
.delete(async (req, res) => {
    const surveyid   = req.params.surveyid;
    const questionid = req.params.questionid;

    debug(`DELETE: /surveys/${surveyid}/questions/${questionid} ;`);

    if(!req.user.id || req.user.role !== 'ADMIN') {
        return res.status(403).send({
            message: 'Unauthorized'
        });
    }

    try {
        const rows = await config.knex("surveys")
        .where("id", surveyid);

        if(rows.length === 0) {
            return res.status(404).send({
                message: 'Survey not found'
            });
        }

        if(rows[0].status === 'LOCKED') {
            return res.status(400).send({
                message: 'Locked survey cannot be modified'
            });
        }

        if(rows[0].is_deleted) {
            return res.status(400).send({
                message: 'Deleted survey cannot be modified'
            });
        }

        const index = await config.knex("questions")
        .update({is_deleted: true})
        .where("id", questionid)
        .andWhere("survey_id", surveyid)
        .returning("index");

        // update questions q2 set index = (select index+1 from questions q1 where q1.id=q2.id);
        if(index.length > 0) {

            await config.knex("questions")
            .decrement("index", 1)
            .andWhere("survey_id", surveyid)
            .andWhere("index", ">", index[0]);
        }

        return res.status(200).send();
    } catch(error) {
        debug(error);
        return res.status(500).send(error);
    }
});

/**
 * Moves question order UP or DOWN
 */
router.post('/:surveyid/questions/:questionid/reorder', async (req, res) => {
    const surveyid   = req.params.surveyid;
    const questionid = req.params.questionid;

    debug(`GET: /surveys/${surveyid}/questions/${questionid}/reorder - ${JSON.stringify(req.body)};`);

    if(!req.user.id || req.user.role !== 'ADMIN') {
        return res.status(403).send({
            message: 'Unauthorized'
        });
    }

    try {
        let delta = 0;
        if(req.body.direction) {
            if(["UP", "DOWN"].includes(req.body.direction)) {
                delta = req.body.direction === "UP" ? -1 : 1;
            } else {
                return res.status(400).send({
                    message: 'Incorrect reorder direction'
                });
            }
        } else {
            return res.status(400).send({
                message: 'Reorder direction missing'
            });
        }

        const rows = await config.knex("surveys")
        .where("id", surveyid);

        if(rows.length === 0) {
            return res.status(404).send({
                message: 'Survey not found'
            });
        }

        if(rows[0].status === 'LOCKED') {
            return res.status(400).send({
                message: 'Locked survey cannot be modified'
            });
        }

        if(rows[0].is_deleted) {
            return res.status(400).send({
                message: 'Deleted survey cannot be modified'
            });
        }

        let q1 = await config.knex("questions as q").select("q.id", "q.index")
        .join("surveys as s", "q.survey_id", "s.id")
        .where("s.id", surveyid)
        .andWhere("q.id", questionid);

        if(q1.length === 0) {
            return res.status(404).send({
                message: 'Question not found'
            });
        }

        let q2 = await config.knex("questions as q").select("q.id", "q.index")
        .join("surveys as s", "q.survey_id", "s.id")
        .where("s.id", surveyid)
        .andWhere("q.index", q1[0].index + delta);

        if(q2.length === 0) {
            return res.status(400).send({
                message: 'Cannot reorder'
            });
        }

        debug(q1, q2);

        await Promise.all([
            config.knex("questions").update({index: q1[0].index}).where("id", q2[0].id),
            config.knex("questions").update({index: q2[0].index}).where("id", q1[0].id)
        ]);
        return res.status(200).send();
    } catch(error) {
        debug(error);
        return res.status(500).send(error);
    }
});

module.exports = router;