const jwt    = require('jsonwebtoken');
const config = require("../../config");

module.exports.verifyToken = async (req, res, next) => {
    const token = req.headers['x-access-token'];
    if(!token) {
        return res.status(400).send({
            'message': 'Token is not provided'
        });
    }
    try {
        const decoded = await jwt.verify(token, process.env.SECRET);
        const rows    = await config.knex("users").where("id", decoded.id);
        if(!rows[0]) {
            return res.status(400).send({
                'message': 'The token you provided is invalid'
            });
        }
        req.user = {
            id: decoded.id,
            role: decoded.role
        };
        next();
    } catch(error) {
        return res.status(400).send(error);
    }
}