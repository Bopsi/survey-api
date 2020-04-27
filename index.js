#!/usr/bin/env node

const debug    = require("debug")("api:server"),
      http     = require("http"),
      {format} = require("util");

const config = require("./config");
const server = require("./server");
const pjson  = require("./package.json");

const app = http.createServer(server);

app.listen(config.PORT, config.HOST, () => {
    process.title = pjson.name + " " + pjson.version;
    process.title = format("%s %s listening on %s:%s", pjson.name, pjson.version, config.HOST, config.PORT);
    debug("Borlaug API service started on %s:%s", config.HOST, config.PORT);
});