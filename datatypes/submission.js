function Submission() {
}

var submission_proto = {
    // Should show posts
    enabled: true,

    // Show NSFW content
    nsfw: false,

    // Show self posts
    self: true,

    // Show links
    links: true,

    // Show stickied posts,
    sticked: true,

    // Minimum score before showing post
    minimum_score: 1,

    // Regex title matching for showing posts
    regex_title_matches: [],

    // The {destination}
    destination: {},

    // The {source} of this config
    source: {}
};
submission_proto._datatype = 'submission.json';

Submission.prototype.submission_proto = submission_proto;
module.exports = new Submission();