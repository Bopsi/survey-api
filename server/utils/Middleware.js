const jwt    = require('jsonwebtoken');
const config = require("../../config");

module.exports.verifyToken = async (req, res, next) => {
    const token = req.headers['x-access-token'];
    console.log("received a req", JSON.stringify(req.headers));
    if(!token) {
        console.log("Token not found");
        return res.status(400).send({
            'message': 'Token is not provided'
        });
    }
    try {
        const decoded = await jwt.verify(token, process.env.SECRET);
        const rows    = await config.knex("users").where("id", decoded.id);
        if(!rows[0]) {
            console.log("Invalid token");
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
        console.error(error);
        return res.status(400).send(error);
    }
}