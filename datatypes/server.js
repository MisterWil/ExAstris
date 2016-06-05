var source_proto = require('./source').source_proto;

function Server() {
}

Server.prototype.getIdentifier = function(server) {
    return server.address.concat(':', server.port);
};

var server_proto = {
    // Server address
    address: 'localhost',

    // Server port
    port: 6667,

    // SSL connection
    secure: false,

    // Bot nickname on server
    nickname: 'ExAstris',

    // Nickserv password
    password: '',

    // Nickserv identify
    identify: false,

    // Nickserv identify delay
    delay: 2500,

    // The {channel}'s for this server
    channels: {},

    // The {source} for this server config
    source: source_proto
};
server_proto._datatype = 'server.json';

Server.prototype.server_proto = server_proto;
module.exports = new Server();