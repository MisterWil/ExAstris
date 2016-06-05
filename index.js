var configParser = require('./util/configparser');

if (!process.argv[2]) {
    console.error("Error: Config file not specified.");
    console.log("Usage: node index ./path/to/config.js");
    return -1;
}

// Load the config file
var config = require(process.argv[2]);

// Set up  the datastore
var Datastore = require('nedb');
var db = new Datastore(config.nedb);

// Set up logging
var log = require('bristol');

if (config.log && config.log.length > 0) {
    // Logging via config file
    configParser.configureBristol(log, config.log);
} else {
    // Default logging
    log.addTarget('console').withFormatter('human');
}

// Set up library
var ExAstris = require('./modules/exastris');
var exastris = new ExAstris(log, db, config);

// Handle sitint events
if (process.platform === "win32") {
    var rl = require("readline").createInterface({
        input: process.stdin,
        output: process.stdout
    });

    rl.on("SIGINT", function () {
        process.emit("SIGINT");
    });
}

process.on("SIGINT", function () {
    exastris.handleShutdown(function() {
        process.exit();
    });
});