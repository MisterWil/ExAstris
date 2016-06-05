var merge = require('merge');

var Server = require('./server');
var User = require('./user');
var Destination = require('./Destination');

var source_proto = require('./source').source_proto;
var tweet_proto = require('./tweet').tweet_proto;

function Follower() {
}

Follower.prototype.construct = function(handle, twitterData, command, target) {
    var followDoc = merge(true, follower_proto);
    var tweet = merge(true, tweet_proto);

    // Create the base follower document
    followDoc.handle = handle;
    followDoc.screen_name = twitterData.screen_name;
    followDoc.id_str = twitterData.id_str;

    // Set the source details
    followDoc.source.user = User.getIdentifier(command.user);
    followDoc.source.target = command.destination;

    // Set the destination of the tweets
    tweet.destination.server = Server.getIdentifier(command.server.serverDoc);
    tweet.destination.target = target;

    // Set the source as a copy of the source above
    tweet.source = merge(true, followDoc.source);

    // Add the tweet destination to the follow doc
    followDoc.tweets[Destination.getIdentifier(tweet.destination)] = tweet;

    return followDoc;
};

var follower_proto = {
    // Normalized input ID
    handle: '',

    // display screen_name via twitter - can change
    screen_name: '',

    // id_str via twitter - never changes
    id_str: '',

    // Currently following this user
    enabled: true,

    // The {tweet}'s by destination with configuration
    tweets: {},

    // The {source} for this follower config
    source: source_proto
};
follower_proto._datatype = 'follower.json';

Follower.prototype.follower_proto = follower_proto;
module.exports = new Follower();
