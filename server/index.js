const cors = require("cors"),
    express = require("express"),
    bodyParser = require("body-parser");

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: false
}));

const user = require("./routes/user"),
    survey = require("./routes/survey");

const middleware = require("./utils/Middleware");

app.use("/health", (req, res, next) => {
    res.send("Survey API");
});

app.use("/users", user);
app.use("/surveys", middleware.verifyToken, survey);

app.use((err, req, res, next) => {
    res.status(err.status || 500);
    res.json(err);
    next(err);
});

module.exports = app;