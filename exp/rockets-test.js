var Rockets = require('rockets');

var client = new Rockets();

// Register events on the client.
client.on('connect', function() {

    var include = {
        // Only receive comments in r/programming.
        subreddit: 'all'
    };
    // Subscribe to the 'comments' channel.
    client.subscribe('posts');
    client.subscribe('comments');
    console.log("Connected");
});

client.on('comment', function(comment) {
    console.log(comment);
});

client.on('post', function(post) {
    console.log(post);
});

client.on('disconnect', function () {
    console.log("Disconnected");
});

client.on('error', function (err) {
    console.log(err);
});

// Initiate the client's socket connection.
client.connect();