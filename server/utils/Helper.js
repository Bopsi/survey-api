const bcrypt = require('bcrypt'),
      jwt    = require('jsonwebtoken');

const EMAIL_REGEX = RegExp(/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/);

module.exports.isValidEmail = function(email) {
    return EMAIL_REGEX.test(email);
};

module.exports.hashPassword = function(password) {
    return bcrypt.hashSync(password, bcrypt.genSaltSync(8))
};

module.exports.comparePassword = function(hashPassword, password) {
    return bcrypt.compareSync(password, hashPassword);
};

module.exports.generateToken = function(id, role, email, first_name, last_name) {
    const token = jwt.sign({
        id: id,
        role: role,
        email: email,
        first_name: first_name,
        last_name: last_name
    },
    process.env.SECRET, {
        expiresIn: '7d'
    }
    );
    return token;
};