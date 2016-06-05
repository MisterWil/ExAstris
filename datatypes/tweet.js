var source_proto = require('./source').source_proto;
var destination_proto = require('./destination').destination_proto;

function Tweet() {
}

var tweet_proto = {
    // Should show tweets
    enabled: true,

    // Should show replies
    replies: true,

    // Should show retweets
    retweets: true,

    // Regex matching for showing tweets
    regex_matches: [],

    // The {destination}
    destination: destination_proto,

    // The {source} of this config
    source: source_proto
};
tweet_proto._datatype = 'tweet.json';

Tweet.prototype.tweet_proto = tweet_proto;
module.exports = new Tweet();