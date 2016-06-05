var source_proto = require('./source').source_proto;
var User_Level = require('./user_level');

function User() {
}

User.prototype.getIdentifier = function(user) {
    return user.username.concat("@", user.hostname);
};

User.prototype.buildIdentifier = function(nickname, username, hostname) {
    return username.concat("@", hostname);
};

var user_proto = {
    // The users nickname - used in identification only if the username and hostname don't match a record?
    nickname: '',

    // The users username - used in identification
    username: '',

    // The users hostname - used in identification
    hostname: '',

    // The {user_level} of the user
    level: User_Level.default,

    // The {source} for this user config
    source: source_proto
};
user_proto._datatype = 'user.json';

User.prototype.user_proto = user_proto;
module.exports = new User();