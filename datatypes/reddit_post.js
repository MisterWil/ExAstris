function Reddit_Post() {
}

var reddit_post_proto = {
    // The subreddit that this post is from
    subreddit: '',

    // The unique post ID
    post_id: '',

    // The minimum score this post much reach before posting to the destination
    minimum_score: 1,

    // The destination for this post
    destination: {}
};
reddit_post_proto._datatype = 'reddit_post.json';

Reddit_Post.prototype.reddit_post_proto = reddit_post_proto;
module.exports = new Reddit_Post();