var source_proto = require('./source').source_proto;

function Reddit() {
}

var reddit_proto = {
    // Normalized subreddit name
    subreddit: '',

    // subreddit_display via reddit {data.subreddit}
    subreddit_display: '',

    // auto-update sorting type
    sorting: 'new', // Do we need this?

    // Currently following this subreddit
    enabled: true,

    // The {submission}'s that posts are configured for by destination
    submissions: {},

    // The {source} for this reddit config
    source: source_proto
};
reddit_proto._datatype = 'reddit.json';

Reddit.prototype.reddit_proto = reddit_proto;
module.exports = new Reddit();
