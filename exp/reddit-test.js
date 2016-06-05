var util = require('util');
var when = require('when');
var Snoocore = require('snoocore');

// Reddit app type "installed"
var reddit = new Snoocore({
    userAgent: 'ExAstris/1.0',
    oauth: {
        type: 'script',
        key: 'l7X4Hsc_rvCwbg',
        secret: 'hnFJo2OEDk__wiwEPV8wSs7jx3A',
        username: 'MisterWil',
        password: 'NotReallyMyPasswordLol',
        scope: [ ]
    }
});

var seen = {};

var startup = new Date().getTime() / 1000;

// Get information about a slice of a listing
function printSlice(slice) {
    slice.stickied.forEach(function(item, i) {
        //console.log('**STICKY**', item.data.title.substring(0, 20) + '...');
    });

    slice.children.forEach(function(child, i) {
        //console.log(slice.count + i + 1, child.data.title.substring(0, 20) + '...');
        console.log(child);

        if (!(child.data.id in seen) && child.data.created_utc > startup) {
            console.log("[" + child.data.subreddit + "] " + child.data.title);
            seen[child.data.id] = {};
        }
    });

    /*reddit('/r/$subreddit/new').listing({
        $subreddit: 'askreddit+aww+cringepics+iama+bestof+wtf+gaming+music+movies',
        limit: 9
    }).then(function(slice) {
        printSlice(slice);
    });*/
}

reddit('/r/$subreddit/comments/$article').get({
    $subreddit: 'redditdev',
    $article: '1hd7kx',
    context: 1,
    limit: 10,
    sort: 'hot'
}).done(function(result) {
    console.log(util.inspect(result, false, null));
});
