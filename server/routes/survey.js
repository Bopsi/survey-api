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
                    // debug("New optionids %j ;", optionids);
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

        let ids = await config.knex("questions").insert({
            survey_id: req.params.surveyid,
            description: req.body.description,
            note: req.body.note,
            mandatory: req.body.mandatory,
            type: req.body.type,
            attachments: req.body.attachments,
            index: index
        })
        .returning("id");

        return res.status(200).send({id: ids[0]});
    } catch(error) {
        debug(error);
        return res.status(500).send({
            error: error,
            message: 'Internal Server Error'
        });
    }
});

/**
 * GET: Retrieves list of options linked with survey
 * POST: Creates a question for a survey
 */
router.route('/:surveyid/options')
.get(async (req, res) => {
    debug(`GET: /surveys/${req.params.surveyid}/options?${JSON.stringify(req.query)} ;`);

    const surveyid = req.params.surveyid;

    try {
        let query = config.knex("options")
        .where("type", "CUSTOM")
        .andWhere("is_deleted", false)
        .andWhere("survey_id", surveyid);

        if(req.query.string && req.query.string.trim() !== '') {
            query = query.andWhere(function() {
                this.orWhere("description", "like", `%${req.query.string}%`)
                .orWhere("value", "like", `%${req.query.string}%`)
            });
        }
        let rows = await query;

        return res.status(200).send(rows);
    } catch(error) {
        debug(error);
        return res.status(500).send(error);
    }
})
.post(async (req, res) => {
    debug(`GET: /surveys/${req.params.surveyid}/options ;`);

    const surveyid = req.params.surveyid;

    try {
        let rows = config.knex("options")
        .where("type", "CUSTOM")
        .andWhere("is_deleted", false)
        .andWhere("survey_id", surveyid);

        return res.status(200).send(rows);

    } catch(error) {
        debug(error);
        return res.status(500).send(error);
    }
})

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
    const surveyid   = req.params.surveyid;
    const questionid = req.params.questionid;

    debug(`PUT: /surveys/${surveyid}/questions/${questionid} - ${JSON.stringify(req.body)} ;`);

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

        await config.knex("questions")
        .update({
            description: req.body.description,
            note: req.body.note,
            mandatory: req.body.mandatory,
            type: req.body.type,
            attachments: req.body.attachments
        })
        .where("id", questionid)
        .andWhere("survey_id", surveyid)
        .returning("index");

        return res.status(200).send();
    } catch(error) {
        debug(error);
        return res.status(500).send(error);
    }
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
        } else if(req.body.index) {

        } else {
            return res.status(400).send({
                message: 'Reorder direction or index is missing'
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

        let q1 = await config.knex("questions as q")
        .select(
        "q.id",
        "q.index",
        config.knex("questions").max("index").as("max")
        .where("s.id", surveyid)
        .andWhere("q.is_deleted", false)
        )
        .join("surveys as s", "q.survey_id", "s.id")
        .where("s.id", surveyid)
        .andWhere("q.id", questionid)
        .andWhere("q.is_deleted", false);

        if(q1.length === 0) {
            return res.status(404).send({
                message: 'Question not found'
            });
        }

        if(req.body.direction === 'UP' && q1[0].index <= 0) {
            return res.status(400).send({
                message: 'Cannot decrease index of first question'
            });
        }

        if(req.body.direction === 'DOWN' && q1[0].index >= q1[0].max) {
            return res.status(400).send({
                message: 'Cannot increase index of last question'
            });
        }

        let q2 = await config.knex("questions as q").select("q.id", "q.index")
        .join("surveys as s", "q.survey_id", "s.id")
        .where("s.id", surveyid)
        .andWhere("q.index", (delta !== 0 ? q1[0].index + delta : req.body.index));

        if(q2.length === 0) {
            return res.status(400).send({
                message: 'Cannot reorder'
            });
        }

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

/**
 * Adds a new custom option or existing option to a question
 */
router.post('/:surveyid/questions/:questionid/options', async (req, res) => {
    const surveyid   = req.params.surveyid;
    const questionid = req.params.questionid;

    debug(`POST: /surveys/${surveyid}/questions/${questionid}/options - ${JSON.stringify(req.body)};`);

    if(!req.user.id || req.user.role !== 'ADMIN') {
        return res.status(403).send({
            message: 'Unauthorized'
        });
    }

    if(!req.body.optionid && !(req.body.value || req.body.description)) {
        return res.status(400).send({
            message: 'Req body does not contain optionid or option'
        });
    }

    let rows = await config.knex("surveys as s")
    .join("questions as q", "s.id", "q.survey_id")
    .select("s.status", "s.is_deleted as survey_deleted", "q.is_deleted as question_deleted")
    .where("s.id", surveyid).andWhere("q.id", questionid);

    if(rows.length === 0) {
        return res.status(404).send({
            message: 'Question not found'
        });
    }

    if(rows[0].status === 'LOCKED') {
        return res.status(400).send({
            message: 'Survey locked'
        });
    }

    if(rows[0].survey_deleted) {
        return res.status(400).send({
            message: 'Survey deleted'
        });
    }

    if(rows[0].question_deleted) {
        return res.status(400).send({
            message: 'Question deleted'
        });
    }

    try {
        // Link an existing option to question
        if(req.body.optionid) {
            let option = await config.knex("options").where("id", req.body.optionid);

            if(option.length === 0) {
                return res.status(404).send({
                    message: 'Option not found'
                });
            }
            option = option[0];

            let index = await config.knex("question_option").max("index").where("question_id", questionid);
            index     = index[0].max ? index[0].max + 1 : 1;

            if(option.type === 'SYSTEM' || (option.type === 'CUSTOM' && option.survey_id === Number(surveyid))) {
                await config.knex("question_option").insert({
                    question_id: questionid,
                    option_id: option.id,
                    index: index
                });
            } else {
                return res.status(400).send({
                    message: 'This option does not belong in the survey'
                });
            }
        } else {
            let index = await config.knex("question_option").max("index").where("question_id", questionid);
            index     = index[0].max ? index[0].max + 1 : 1;

            await config.knex.transaction(async trx => {
                let option = await config.knex("options").insert({
                    value: req.body.value,
                    description: req.body.description,
                    type: 'CUSTOM',
                    survey_id: surveyid
                })
                .returning("*")
                .transacting(trx);

                option = option[0];

                await config.knex("question_option").insert({
                    question_id: questionid,
                    option_id: option.id,
                    index: index
                })
                .transacting(trx);
            });
        }
        return res.status(200).send();
    } catch(error) {
        debug(error);
        return res.status(500).send(error);
    }
});

/**
 * Adds a new custom option or existing option to a question
 */
router.delete('/:surveyid/questions/:questionid/options/:optionid', async (req, res) => {
    const surveyid   = req.params.surveyid;
    const questionid = req.params.questionid;
    const optionid   = req.params.optionid;

    debug(`DELETE: /surveys/${surveyid}/questions/${questionid}/options/${optionid} - ${JSON.stringify(req.body)};`);

    if(!req.user.id || req.user.role !== 'ADMIN') {
        return res.status(403).send({
            message: 'Unauthorized'
        });
    }

    let rows = await config.knex("surveys as s")
    .join("questions as q", "s.id", "q.survey_id")
    .join("question_option as qo", "q.id", "qo.question_id")
    .join("options as o", "qo.option_id", "o.id")
    .select("s.status", "s.is_deleted as survey_deleted",
    "q.is_deleted as question_deleted", "o.is_deleted as option_deleted")
    .where("s.id", surveyid)
    .andWhere("q.id", questionid)
    .andWhere("o.id", optionid);

    if(rows.length === 0) {
        return res.status(404).send({
            message: 'Option not found'
        });
    }

    if(rows[0].status === 'LOCKED') {
        return res.status(400).send({
            message: 'Survey locked'
        });
    }

    if(rows[0].survey_deleted) {
        return res.status(400).send({
            message: 'Survey deleted'
        });
    }

    if(rows[0].question_deleted) {
        return res.status(400).send({
            message: 'Question deleted'
        });
    }

    if(rows[0].option_deleted) {
        return res.status(400).send({
            message: 'Option already deleted'
        });
    }

    try {
        let index = await config.knex("question_option").delete()
        .where("question_id", questionid)
        .andWhere("option_id", optionid)
        .returning("index");

        if(index.length > 0) {
            await config.knex("question_option")
            .decrement("index", 1)
            .andWhere("question_id", questionid)
            .andWhere("index", ">", index[0]);
        }

        return res.status(200).send();
    } catch(error) {
        debug(error);
        return res.status(500).send(error);
    }
});

/**
 * Moves option order UP or DOWN
 */
router.post('/:surveyid/questions/:questionid/options/:optionid/reorder', async (req, res) => {
    const surveyid   = req.params.surveyid;
    const questionid = req.params.questionid;
    const optionid   = req.params.optionid;

    debug(`POST: /surveys/${surveyid}/questions/${questionid}/options/${optionid}/reorder - ${JSON.stringify(req.body)};`);

    if(!req.user.id || req.user.role !== 'ADMIN') {
        return res.status(403).send({
            message: 'Unauthorized'
        });
    }

    let rows = await config.knex("surveys as s")
    .join("questions as q", "s.id", "q.survey_id")
    .join("question_option as qo", "q.id", "qo.question_id")
    .join("options as o", "qo.option_id", "o.id")
    .select(
    "s.status", "s.is_deleted as survey_deleted", "qo.id", "qo.index",
    "q.is_deleted as question_deleted", "o.is_deleted as option_deleted",
    config.knex("question_option").max("index").as("max").where("question_id", questionid)
    )
    .where("s.id", surveyid)
    .andWhere("q.id", questionid)
    .andWhere("o.id", optionid);

    debug('rows', rows);

    if(rows.length === 0) {
        return res.status(404).send({
            message: 'Option not found'
        });
    }

    if(rows[0].status === 'LOCKED') {
        return res.status(400).send({
            message: 'Survey locked'
        });
    }

    if(rows[0].survey_deleted) {
        return res.status(400).send({
            message: 'Survey deleted'
        });
    }

    if(rows[0].question_deleted) {
        return res.status(400).send({
            message: 'Question deleted'
        });
    }

    if(rows[0].option_deleted) {
        return res.status(400).send({
            message: 'Option already deleted'
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
        }


        let q1 = [{
            id: rows[0].id,
            index: rows[0].index
        }];

        if(req.body.direction === 'UP' && q1[0].index <= 0) {
            return res.status(400).send({
                message: 'Cannot decrease index of first question'
            });
        }

        if(req.body.direction === 'DOWN' && q1[0].index >= q1[0].max) {
            return res.status(400).send({
                message: 'Cannot increase index of last question'
            });
        }

        let q2 = await config.knex("question_option").select("id", "index")
        .where("question_id", questionid)
        .andWhere("index", q1[0].index + delta);

        if(q2.length === 0) {
            return res.status(400).send({
                message: 'Cannot reorder'
            });
        }

        await Promise.all([
            config.knex("question_option").update({index: q1[0].index}).where("id", q2[0].id),
            config.knex("question_option").update({index: q2[0].index}).where("id", q1[0].id)
        ]);
        return res.status(200).send();
    } catch(error) {
        debug(error);
        return res.status(500).send(error);
    }
});

/**
 * GET - retrieves list of records for a survey
 * POST - creates a new record for a survey
 */
router.route('/:surveyid/records')
.get(async (req, res) => {
    debug(`GET : /surveys/${req.params.surveyid}/records ;`);

    let query = config.knex("surveys as s")
    .join("accesses as x", "s.id", "x.survey_id")
    .leftJoin("records as r", "s.id", "r.survey_id")
    .leftJoin("users as u", "r.created_by", "u.id")
    .select("r.*", "u.first_name", "u.last_name", "u.email")
    .where("x.user_id", req.user.id)
    .andWhere("r.is_deleted", false)
    .andWhere("s.id", req.params.surveyid);

    const rows = await query;

    return res.status(200).send(rows);
})
.post(async (req, res) => {
    debug(`POST : /surveys/${req.params.surveyid}/records - ${JSON.stringify(req.body)};`);

    let survey = await config.knex("surveys")
    .where("id", req.params.surveyid);

    if(survey.length === 0) {
        return res.status(404).send({
            message: "Survey not found"
        });
    }
    survey = survey[0];

    if(survey.is_deleted) {
        return res.status(400).send({
            message: "Cannot create record of deleted survey"
        });
    }

    if(survey.status === 'UNLOCKED') {
        return res.status(400).send({
            message: "Cannot create record of unlocked survey"
        });
    }

    let access = await config.knex("accesses")
    .where("survey_id", req.params.surveyid)
    .andWhere("user_id", req.user.id);

    if(access.length === 0 || !access[0].is_active) {
        return res.status(403).send({
            message: "Unauthorized"
        });
    }

    if(!req.body.subject_name || !req.body.subject_description) {
        return res.status(400).send({
            message: "Subject name or description missing"
        });
    }

    try {
        await config.knex.transaction(async (tx) => {
            let record = await config.knex("records").insert({
                survey_id: survey.id,
                created_by: req.user.id,
                subject_name: req.body.subject_name,
                subject_description: req.body.subject_description,
            })
            .returning("id")
            .transacting(tx);

            let recordid = record[0];

            let questions = await config.knex("questions").select("id")
            .where("survey_id", survey.id)
            .andWhere("is_deleted", false)
            .orderBy("index");

            let answers = [];

            questions.forEach(q => {
                answers.push({
                    record_id: recordid,
                    question_id: q.id
                });
            });

            await config.knex("answers").insert(answers).transacting(tx);

            return res.status(200).send();
        });
    } catch(error) {
        return res.status(403).send({
            error: error,
            message: "Internal server error"
        })
    }
});

/**
 * GET - retrieves a record
 */
router.route('/:surveyid/records/:recordid')
.get(async (req, res) => {
    debug(`GET : /surveys/${req.params.surveyid}/records/${req.params.recordid} ;`);

    const rows = await config.knex("surveys as s")
    .join("accesses as x", "s.id", "x.survey_id")
    .leftJoin("records as r", "s.id", "r.survey_id")
    .leftJoin("users as u", "r.created_by", "u.id")
    .leftJoin("answers as a", "u.id", "a.id")
    .select("r.*", "u.first_name", "u.last_name", "u.email")
    .where("x.user_id", req.user.id)
    .andWhere("s.id", req.params.surveyid)
    .andWhere("r.id", req.params.recordid)

    if(rows.length === 0) {
        return res.status(404).send();
    }

    return res.status(200).send(rows[0]);
})
.delete(async (req, res) => {
    debug(`DELETE : /surveys/${req.params.surveyid}/records/${req.params.recordid} ;`);

    const rows = await config.knex("surveys as s")
    .join("accesses as x", "s.id", "x.survey_id")
    .leftJoin("records as r", "s.id", "r.survey_id")
    .leftJoin("users as u", "r.created_by", "u.id")
    .select("s.status", "s.is_deleted as survey_deleted",
    "r.is_deleted as record_deleted", "r.created_by")
    .where("x.user_id", req.user.id)
    .andWhere("s.id", req.params.surveyid)
    .andWhere("r.id", req.params.recordid);

    if(rows.length === 0 || rows[0].record_deleted) {
        return res.status(404).send({
            message: "Record not found"
        })
    }

    if(rows[0].survey_deleted) {
        return res.status(404).send({
            message: "Survey not found"
        })
    }

    if(req.user.role === 'ADMIN' || (req.user.role === 'USER' && rows[0].created_by === req.user.id)) {
        await config.knex("records").update({is_deleted: true}).where("id", req.params.recordid);

        return res.status(200).send();
    } else {
        return res.status(403).send({
            message: "Unauthorized"
        })
    }
});

/**
 * GET - retrieves all answers of a record
 * PUT - saves answer of a record
 * POST - saves and submits answers of a record
 */
router.route('/:surveyid/records/:recordid/answers')
.get(async (req, res) => {
    const surveyid = req.params.surveyid;
    const recordid = req.params.recordid;
    debug(`GET : /surveys/${surveyid}/records/${recordid}/answers -  ${JSON.stringify(req.body)};`);

    let survey = await config.knex("surveys")
    .where("id", surveyid);

    if(survey.length === 0) {
        return res.status(404).send({
            message: "Survey not found"
        });
    }
    survey = survey[0];

    if(survey.is_deleted) {
        return res.status(400).send({
            message: "Cannot answer deleted survey"
        });
    }

    if(survey.status === 'UNLOCKED') {
        return res.status(400).send({
            message: "Cannot answer unlocked survey"
        });
    }

    let access = await config.knex("accesses")
    .where("survey_id", surveyid)
    .andWhere("user_id", req.user.id);

    if(access.length === 0 || !access[0].is_active) {
        return res.status(403).send({
            message: "Unauthorized"
        });
    }

    try {
        const optionsQuery = config.knex("question_option as qo")
        .leftJoin("options as o", "qo.option_id", "o.id")
        .select("o.*", "qo.index", "qo.id as qo_id", "qo.question_id");

        const questionsQuery = config.knex("questions as q")
        .join("answers as a", "q.id", "a.question_id")
        .leftJoin(optionsQuery.as("o"), "q.id", "o.question_id")
        .select("q.*", config.knex.raw("to_json(array_remove(array_agg(o),NULL)) \"options\""),
        "a.id as answer_id", "text", "radio", "checkbox")
        .groupBy("q.id", "a.id")
        .where("q.survey_id", surveyid)
        .andWhere("a.record_id", recordid)
        .andWhere("q.is_deleted", false)
        .andWhere("a.record_id", recordid);

        let questions = await questionsQuery;

        questions = _.chain(questions)
        .sortBy("index")
        .map(function(question) {
            question.options = _.sortBy(question.options, "index");
            return question;
        });
        return res.status(200).send(questions);
    } catch(e) {
        debug(e);
        return res.status(500).send({
            error: e,
            message: 'Internal Server Error'
        });
    }
})
.put(async (req, res) => {
    debug(`PUT : /surveys/${req.params.surveyid}/records/${req.params.recordid}/answers -  ${JSON.stringify(req.body)};`);

    let survey = await config.knex("surveys")
    .where("id", req.params.surveyid);

    if(survey.length === 0) {
        return res.status(404).send({
            message: "Survey not found"
        });
    }
    survey = survey[0];

    if(survey.is_deleted) {
        return res.status(400).send({
            message: "Cannot answer deleted survey"
        });
    }

    if(survey.status === 'UNLOCKED') {
        return res.status(400).send({
            message: "Cannot answer unlocked survey"
        });
    }

    let access = await config.knex("accesses")
    .where("survey_id", req.params.surveyid)
    .andWhere("user_id", req.user.id);

    if(access.length === 0 || !access[0].is_active) {
        return res.status(403).send({
            message: "Unauthorized"
        });
    }

    try {
        await config.knex("answers").update({
            text: req.body.text,
            radio: req.body.radio,
            checkbox: req.body.checkbox ? JSON.stringify(req.body.checkbox) : req.body.checkbox
        })
        .where("id", req.body.id)
        .andWhere("record_id", req.params.recordid)
        .andWhere("question_id", req.body.question_id)
        return res.status(200).send({});
    } catch(e) {
        debug(e);
        return res.status(500).send({
            error: e,
            message: 'Internal Server Error'
        });
    }
})
.post(async (req, res) => {
    debug(`POST : /surveys/${req.params.surveyid}/records/${req.params.recordid}/answers -  ${JSON.stringify(req.body)};`);

    let survey = await config.knex("surveys")
    .where("id", req.params.surveyid);

    if(survey.length === 0) {
        return res.status(404).send({
            message: "Survey not found"
        });
    }
    survey = survey[0];

    if(survey.is_deleted) {
        return res.status(400).send({
            message: "Cannot answer deleted survey"
        });
    }

    if(survey.status === 'UNLOCKED') {
        return res.status(400).send({
            message: "Cannot answer unlocked survey"
        });
    }

    let access = await config.knex("accesses")
    .where("survey_id", req.params.surveyid)
    .andWhere("user_id", req.user.id);

    if(access.length === 0 || !access[0].is_active) {
        return res.status(403).send({
            message: "Unauthorized"
        });
    }

    try {
        // and ((q.type = 'TEXT' and a.text is not null) or (q.type = 'RADIO' and a.radio is not null) or (q.type = 'CHECKBOX' and a.checkbox is not null));

        let count = await config.knex("answers as a")
        .join("questions as q", "a.question_id", "q.id")
        .count("*")
        .where("a.record_id", Number(req.params.recordid))
        .andWhere(config.knex.raw("(q.type = 'TEXT' and a.text is null) or (q.type = 'RADIO' and a.radio is null)"));

        debug("count",count[0].count);

        if(Number(count[0].count) !== 0) {
            return res.status(500).send({
                message: "All mandatory questions must be answered"
            });
        }

        await config.knex("records").update({"locked_at": config.knex.fn.now(6)}).where("id", Number(req.params.recordid));

        return res.status(200).send({});
    } catch(e) {
        debug(e);
        return res.status(500).send({
            error: e,
            message: 'Internal Server Error'
        });
    }
});

module.exports = router;