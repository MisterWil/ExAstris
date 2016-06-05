var Twit = require('twit');
var merge = require('merge');

var Entities = require('html-entities').AllHtmlEntities;
var entities = new Entities();

var Follower = require('../datatypes/follower'), follower_proto = Follower.follower_proto;
var Tweet = require('../datatypes/tweet'), tweet_proto = Tweet.tweet_proto;
var Destination = require('../datatypes/destination'), destination_proto = Destination.destination_proto;
var Source = require('../datatypes/source'), source_proto = Source.source_proto;
var Server = require('../datatypes/server'), server_proto = Server.server;
var Channel = require('../datatypes/channel'), channel_proto = Channel.channel_proto;
var User = require('../datatypes/user'), user_proto = User.user_proto;

function Twitter() {}

var moduleName = "Twitter/1.0";
Twitter.prototype.moduleName = moduleName;

Twitter.prototype.onLoad = function (exastris, log, db, config) {
    var self = this;

    self.exastris = exastris;
    self.log = log;
    self.db = db;
    self.config = config;

    self.log.info(moduleName + " Instance Initialized");

    if (!self.config.twitter) {
        return self.log.error("No Twitter config specified. Skipping module loading.");
    }

    // Load twit module
    self.twit = new Twit(self.config.twitter);

    // Stream controller object
    self.streamObject = {
        // A map of twitter user id_str to followDoc's
        followerMap: {},

        // A map of destinations containing a map of tweet id_str
        destTweets: {}
    };

    self.loadFollowers();
    self.registerCallbacks();
};

Twitter.prototype.registerCallbacks = function() {
    var self = this;

    self.exastris.register('follow', true, 'follow [@handle] - Follow and show tweets from a specific twitter user.', self.handleFollow.bind(self));
    self.exastris.register('start following', true, 'start following [@handle] - Follow and show tweets from a specific twitter user.', self.handleFollow.bind(self));
    self.exastris.register('stop following', true, 'stop following [@handle] - Stop following a specific twitter user. There will be no more tweets shown anywhere from that user.', self.handleStopFollow.bind(self));

    self.exastris.register('show tweets from', true, 'show tweets from [@handle] (destination) - Show tweets from a followed twitter user.', self.handleShow.bind(self));
    self.exastris.register('start showing tweets from', true, 'start showing tweets from [@handle] (destination) - Show tweets from a followed twitter user.', self.handleShow.bind(self));
    self.exastris.register('stop showing tweets from', true, 'stop showing tweets from [@handle] (destination) - Stop showing tweets from a followed twitter user.)', self.handleStopShow.bind(self));

    self.exastris.register('show replies from', true, 'show replies from [@handle] (destination) - Include replies when following a specific twitter user.', self.handleSetProperty.bind(self, 'replies', true));
    self.exastris.register('start showing replies from', true, 'start showing replies from [@handle] (destination) - Include replies when following a specific twitter user.', self.handleSetProperty.bind(self, 'replies', true));
    self.exastris.register('stop showing replies from', true, 'stop showing replies from [@handle] (destination) - Don\'t include replies when following a specific twitter user.', self.handleSetProperty.bind(self, 'replies', false));

    self.exastris.register('show retweets from', true, 'show retweets from [@handle] (destination) - Include retweets when following a specific twitter user.', self.handleSetProperty.bind(self, 'retweets', true));
    self.exastris.register('start showing retweets from', true, 'start showing retweets from [@handle] (destination) - Include retweets when following a specific twitter user.', self.handleSetProperty.bind(self, 'retweets', true));
    self.exastris.register('stop showing retweets from', true, 'stop showing retweets from [@handle] (destination) - Don\'t include retweets when following a specific twitter user.', self.handleSetProperty.bind(self, 'retweets', false));

    // Are you listening to
    self.exastris.register('are you following', true, 'are you following [@handle] (destination) - Details the current following status of a given twitter user.', self.handleStatus.bind(self));

    // Who are you following/listening to
};

Twitter.prototype.handleFollow = function(command) {
    var self = this;

    var handle = self.parseHandle(command.arguments[0]);

    if (!handle) {
        return self.exastris.reply(command, "I think you forgot to include the twitter handle I should follow.");
    }

    // Target is implied
    var target = self.parseTarget(command.destination);

    self.follow(command, handle, target, function(result) {
        if (!result.success) {
            return self.exastris.reply(command, result.message);
        }

        var successMessage = "I'm following tweets from @" + result.followDoc.screen_name + "!";

        var tweetDest = Destination.buildIdentifier(Server.getIdentifier(command.server.serverDoc), target);
        if (tweetDest in result.followDoc.tweets) {
            successMessage = successMessage.concat(" I'll show the tweets in " + target + "!");
        } else {
            successMessage = successMessage.concat(" FYI: I'm not showing the tweets in here so you might want to do that.");
        }

        self.exastris.reply(command, successMessage);
    });
};

Twitter.prototype.handleStopFollow = function(command) {
    var self = this;

    var handle = self.parseHandle(command.arguments[0]);

    if (!handle) {
        return self.exastris.reply(command, "I think you forgot to include the twitter handle I should stop following.");
    }

    // Target is implied
    var target = self.parseTarget(command.destination);

    self.unfollow(command, handle, target, function(result) {
        if (!result.success) {
            return self.exastris.reply(command, result.message);
        }

        self.exastris.reply(command, "I am no longer following or showing tweets from @" + result.followDoc.screen_name + ".");
    });
};

Twitter.prototype.handleShow = function(command) {
    var self = this;

    var handle = self.parseHandle(command.arguments[0]);

    if (!handle) {
        return self.exastris.reply(command, "I think you forgot to include the twitter handle I should show.");
    }

    // Determine the destination
    var target = self.parseTarget(command.destination, command.arguments.slice(1));

    if (target === command.server.ircClient.nick.toLowerCase()) {
        return self.exastris.reply(command, "Silly wabbits, Trix are for kids!");
    }

    self.startShowingTweets(command, handle, target, function(result) {
        if (!result.success) {
            return self.exastris.reply(command, result.message);
        }

        self.exastris.reply(command, "Aye aye, I'll show any tweets I see from @" + result.followDoc.screen_name + " to " + target + ".");
    });
};

Twitter.prototype.handleStopShow = function(command) {
    var self = this;

    var handle = self.parseHandle(command.arguments[0]);

    if (!handle) {
        return self.exastris.reply(command, "I think you forgot to include the twitter handle I should stop showing.");
    }

    // Determine the destination
    var target = self.parseTarget(command.destination, command.arguments.slice(1));

    if (target === command.server.ircClient.nick.toLowerCase()) {
        return self.exastris.reply(command, "Silly wabbits, Trix are for kids!");
    }

    self.stopShowingTweets(command, handle, target, function(result) {
        if (!result.success) {
            return self.exastris.reply(command, result.message);
        }

        self.exastris.reply(command, "I'll shut up and stop showing tweets from @" + result.followDoc.screen_name + " to " + target + ".");
    });
};

Twitter.prototype.handleSetProperty = function(property, value, command) {
    var self = this;

    var handle = self.parseHandle(command.arguments[0]);

    if (!handle) {
        return self.exastris.reply(command, "I think you forgot to include the twitter handle!.");
    }

    // Determine the destination
    var target = self.parseTarget(command.destination, command.arguments.slice(1));

    if (target === command.server.ircClient.nick.toLowerCase()) {
        return self.exastris.reply(command, "Silly wabbits, Trix are for kids!");
    }

    self.setDestinationProperty(command, handle, target, property, value, function(result) {
        if (!result.success) {
            return self.exastris.reply(command, result.message);
        }

        self.exastris.reply(command, "Surely, I've " + (value ? "enabled" : "disabled") + " " + property + " from @" + result.followDoc.screen_name + " to " + target + ".");
    });
};

Twitter.prototype.handleStatus = function(command) {
    var self = this;

    var handle = self.parseHandle(command.arguments[0]);

    if (!handle) {
        return self.exastris.reply(command, "I think you forgot to include the twitter handle!.");
    }

    // Determine the destination
    var target = self.parseTarget(command.destination, command.arguments.slice(1));

    if (target === command.server.ircClient.nick.toLowerCase()) {
        return self.exastris.reply(command, "Silly wabbits, Trix are for kids!");
    }

    self.getFollowDoc(handle, function (result) {
        if (!result.success) {
            return self.exastris.reply(command, "Nope, I'm not following @" + handle + ".");
        }

        var followDoc = result.followDoc;

        var response = "Yes, I am following @" + followDoc.screen_name + "!";

        var tweetDest = Destination.buildIdentifier(Server.getIdentifier(command.server.serverDoc), target);
        if (tweetDest in followDoc.tweets) {
            var tweetDoc = followDoc.tweets[tweetDest];

                if (!tweetDoc.enabled) {
                response = response.concat(" Though I'm currently not repeating tweets to " + target + ".");
            } else {
                var replies = tweetDoc.replies ? "with replies" : "without replies";
                var retweets = tweetDoc.retweets ? "with retweets" : "without retweets";

                response = response.concat(" I'm also showing tweets " + replies + " and " + retweets + " to " + target + "!");
            }
        } else {
            response = response.concat(" However, nobody has told me to be a good robot and repeat their tweets to " + target + "...");
        }

        self.exastris.reply(command, response);
    });
};

Twitter.prototype.parseHandle = function(handleArg) {
    if (!handleArg || !handleArg.trim()) {
        return;
    }

    var handle = handleArg;

    if (handle.substr(0, 1) === '@') {
        handle = handle.substr(1, handle.length);
    }

    return handle.toLowerCase();
};

Twitter.prototype.parseTarget = function(destination, destArgs) {
    var self = this;

    if (destArgs && destArgs.length > 0) {
        if (destArgs[0].trim().match(/(to|in)/ig) && destArgs.length > 1) {
            // Recursive destination call?
            return self.parseTarget(destination, destArgs.slice(1));
        } else if (destArgs[0].trim().toLowerCase() !== "here") {
            destination = destArgs[0];
        }
    }

    return destination.toLowerCase();
};

Twitter.prototype.getFollowDoc = function(handle, callback) {
    var self = this;

    // First let's see if we're already following the user
    self.db.findOne({handle: handle}, function (err, followDoc) {
        if (err) {
            self.log.error("Error finding follower document in database", err);

            callback({
                success: false,
                message: "Well, this is embarrassing, but I got an error and I don't know how to proceed. Sorry!",
                err: err
            });
            return;
        }

        if (!followDoc) {
            return callback({
                success: false,
                message: "I don't seem to be following @" + handle + "... Sorry!"
            });
        }

        return callback({
            success: true,
            followDoc: followDoc
        });
    });
};

Twitter.prototype.follow = function(command, handle, target, callback) {
    var self = this;

    // First let's see if we're already following the user
    self.db.findOne({handle: handle, _datatype: follower_proto._datatype}, function (err, followDoc) {
        if (err) {
            self.log.error("Error finding follower document in database", err);

            callback({
                success: false,
                message: "Well, this is embarrassing, but I got an error and I don't know how to proceed. Sorry!",
                err: err
            });
            return;
        }

        if (followDoc && followDoc.enabled) {
            // We're already following the user and they're enabled, let's go ahead and show tweets from the user...
            return self.startShowingTweets(command, handle, target, callback);
        } else if (followDoc && !followDoc.enabled) {
            // The doc already exists, let's go ahead and just re-enable it
            followDoc.enabled = true;

            return self.updateFollowerDoc(followDoc, true, callback);
        }

        // Then we need to ask twitter to give us the details about the user...
        self.twit.get('users/show', {screen_name: handle}, function (err, data) {
            if (err) {
                switch(err.code) {
                    case 34:
                    case 50:
                        callback({
                            success: false,
                            message: "The Twitter is telling me that the handle @" + handle + " doesn't actually exist.",
                            err: err
                        });
                        return;
                    default:
                        self.log.error("Unknown Twitter Error", err);

                        callback({
                            success: false,
                            message: "Well, that didn't work. What the hell does this error mean: " + err.message + " [Code: " + err.code + "]?",
                            err: err
                        });
                }
                return;
            }

            // Create and add the follower
            followDoc = Follower.construct(handle, data, command, target);

            self.db.insert(followDoc, function (err) {
                if (err) {
                    self.log.error("Database Insert Error", err);

                    callback({
                        success: false,
                        message: "Well, this is embarrassing, but I got an error and I don't know how to proceed. Sorry!",
                        err: err
                    });
                    return;
                }

                // Add the follow document to the stream
                self.updateFollowerStream(followDoc, true, callback);
            });
        });
    });
};

Twitter.prototype.unfollow = function(command, handle, target, callback) {
    var self = this;

    // First lets find the user
    self.db.findOne({handle: handle, _datatype: follower_proto._datatype}, function (err, followDoc) {
        if (err) {
            self.log.error("Error finding follower document in database", err);

            callback({
                success: false,
                message: "Well, this is embarrassing, but I got an error and I don't know how to proceed. Sorry!",
                err: err
            });
            return;
        }

        if (!followDoc) {
            self.log.debug("Attempted to unfollow a twitter user that is not being followed: " + handle);

            callback({
                success: false,
                message: "I don't seem to be following @" + handle + "... Sorry!"
            });
            return;
        }

        if (!followDoc.enabled) {
            callback({
                success: false,
                message: "Know of @" + followDoc.screen_name + " I do; following them, I am not."
            });
            return;
        }

        // Disable the follower
        followDoc.enabled = false;
        self.updateFollowerDoc(followDoc, true, callback);
    });
};

Twitter.prototype.startShowingTweets = function(command, handle, target, callback) {
    var self = this;

    // First let's find the handle we want to follow
    self.db.findOne({handle: handle, _datatype: follower_proto._datatype}, function (err, followDoc) {
        if (err) {
            self.log.error("Error finding follower document in database.", err);

            callback({
                success: false,
                message: "Well, this is embarrassing, but I got an error and I don't know how to proceed. Sorry!",
                err: err
            });
            return;
        }

        // Now let's see if we're following that user...
        if (!followDoc) {
            callback({
                success: false,
                message: "I'm not currently following that twitter handle. Try following @" + handle + " first..."
            });
            return;
        }

        // And let's make sure we're not already sending the tweets to the given destination
        var tweetDest = Destination.buildIdentifier(Server.getIdentifier(command.server.serverDoc), target);
        if (followDoc.tweets && tweetDest in followDoc.tweets) {
            if (followDoc.tweets[tweetDest].enabled) {
                callback({
                    success: false,
                    message: "Don't you fret, I'm already keeping my digital ports peeled for tweets from @" + followDoc.screen_name + " that I can repeat back to " + target + "!"
                });
                return;
            } else {
                // Destination already exists, let's just go ahead and re-enable it
                followDoc.tweets[tweetDest].enabled = true;
                return self.updateFollowerDoc(followDoc, false, callback);
            }
        }

        var tweet = merge(true, tweet_proto);

        // Set the destination of the tweets
        tweet.destination.server = Server.getIdentifier(command.server.serverDoc);
        tweet.destination.target = target;

        // Set the source details
        tweet.source.user = User.getIdentifier(command.user);
        tweet.source.target = command.destination;

        // Add the tweet destination to the follow doc
        followDoc.tweets[Destination.getIdentifier(tweet.destination)] = tweet;

        self.updateFollowerDoc(followDoc, false, callback);
    });
};

Twitter.prototype.stopShowingTweets = function(command, handle, target, callback) {
    var self = this;

    // First let's find the handle we want to follow
    self.db.findOne({handle: handle, _datatype: follower_proto._datatype}, function (err, followDoc) {
        if (err) {
            self.log.error("Error finding follower document in database.", err);

            callback({
                success: false,
                message: "Well, this is embarrassing, but I got an error and I don't know how to proceed. Sorry!",
                err: err
            });
            return;
        }

        // Now let's see if we're following that user...
        if (!followDoc) {
            callback({
                success: false,
                message: "I'm not currently following that twitter handle. Try following @" + handle + " first..."
            });
            return;
        }

        if (followDoc.tweets) {
            var tweetDest = Destination.buildIdentifier(Server.getIdentifier(command.server.serverDoc), target);
            if (!(tweetDest in followDoc.tweets) || !followDoc.tweets[tweetDest].enabled) {
                return callback({
                    success: false,
                    message: "I'm not sharing tweets from @" + followDoc.screen_name + " there."
                });
            }

            // Disable the destination
            followDoc.tweets[tweetDest].enabled = false;
            return self.updateFollowerDoc(followDoc, false, callback);
        }
    });
};

Twitter.prototype.setDestinationProperty = function(command, handle, target, property, value, callback) {
    var self = this;

    // First let's find the handle we want to follow
    self.db.findOne({handle: handle, _datatype: follower_proto._datatype}, function (err, followDoc) {
        if (err) {
            self.log.error("Error finding follower document in database.", err);

            callback({
                success: false,
                message: "Well, this is embarrassing, but I got an error and I don't know how to proceed. Sorry!",
                err: err
            });
            return;
        }

        // Now let's see if we're following that user...
        if (!followDoc) {
            callback({
                success: false,
                message: "I'm not currently following that twitter handle. Try following @" + handle + " first..."
            });
            return;
        }

        var tweetDest = Destination.buildIdentifier(Server.getIdentifier(command.server.serverDoc), target);

        if (followDoc.tweets && tweetDest in followDoc.tweets) {
            followDoc.tweets[tweetDest][property] = value;
            return self.updateFollowerDoc(followDoc, false, callback);
        } else {
            return callback({
                success: false,
                message: "I'm not sharing tweets from @" + followDoc.screen_name + " to " + target + "."
            });
        }
    });
};

Twitter.prototype.loadFollowers = function() {
    var self = this;

    self.db.find({id_str : {$exists: true}}, function (err, followDocs) {
        if (err) {
            self.log.error("Error loading followers from database.", err);
            return;
        }

        followDocs.forEach(function (followDoc) {
            self.streamObject.followerMap[followDoc.id_str] = followDoc;
            self.log.debug("Loaded Twitter Follower: " + followDoc.screen_name);
        });

        self.updateStream();
    });
};

Twitter.prototype.updateFollowerDoc = function(followDoc, restartStream, callback) {
    var self = this;

    self.db.update({_id: followDoc._id}, followDoc, {}, function (err, numReplaced) {
        if (err) {
            self.log.error("Error updating follower document in database.", err);

            callback({
                success: false,
                message: "Well, this is embarrassing, but I got an error and I don't know how to proceed. Sorry!",
                err: err
            });
            return;
        }

        if (numReplaced === 0) {
            self.log.error("Failed to change status of follower doc in database.");

            callback({
                success: false,
                message: "It would seem that I can't currently modify that follower. Tell my creator to Read The Effing Logs!"
            });
            return;
        }

        // And finally let's update the doc in the stream
        self.updateFollowerStream(followDoc, restartStream, callback);
    });
};

Twitter.prototype.updateFollowerStream = function(followDoc, restartStream, callback) {
    var self = this;

    // Let's add/update the document in the follower stream map
    self.streamObject.followerMap[followDoc.id_str] = followDoc;

    var result = true;

    if (restartStream) {
        // Update the stream
        result = self.updateStream();
    }

    if (result) {
        return callback({
            success: true,
            followDoc: followDoc
        });
    } else {
        return callback({
            success: false,
            message: "Failed to update the follower stream."
        });
    }
};

Twitter.prototype.updateStream = function() {
    var self = this;

    // Stop the stream if it exists
    if (self.streamObject.stream) {
        self.log.debug("Stopping Twitter Stream");
        self.streamObject.stream.stop();
    }

    if (self.streamObject.followerMap.length === 0) {
        return false;
    }

    // Compile the follow parameter
    var followers = [];

    for (var id_str in self.streamObject.followerMap) {
        if (self.streamObject.followerMap[id_str].enabled) {
            followers.push(id_str);
        } else {
            self.log.trace("Skipping Disabled Twitter ID: " + id_str);
        }
    }

    if (followers.length === 0) {
        return false;
    }

    var followParam = followers.join(",");

    self.log.debug("Following Twitter ID's: " + followParam);

    // Now let's go ahead and (re)create the stream
    self.streamObject.stream = self.twit.stream('statuses/filter', {follow: followParam});

    // Re-register to the events we care about
    self.streamObject.stream.on('tweet', self.onTweet.bind(self));
    self.streamObject.stream.on('error', self.onError.bind(self));

    self.log.debug("Started Twitter Stream");

    return true;
};

Twitter.prototype.cleanTweet = function(tweet) {
    var cleanedTweet = tweet.text;

    if (tweet.retweeted_status) {
        // If we're retweeting something, we really want to be using the text of the retweet
        // to prevent any truncating that may have occured (ugh, 20 minutes to figure out)
        cleanedTweet = "RT @" + tweet.retweeted_status.user.screen_name + ": " + tweet.retweeted_status.text;
    }

    // Decode HTML entities...
    cleanedTweet = entities.decode(cleanedTweet);

    // Now remove all line breaks and replace them with a space...
    cleanedTweet = cleanedTweet.replace(/(\r\n|\n|\r)/gm, " ");

    // Let's also remove any tabs and replace them with a space...
    cleanedTweet = cleanedTweet.replace(/\t/gm, " ");

    // Finally, remove any double spaces that may have piled up!
    cleanedTweet = cleanedTweet.replace(/\s+/g, " ");

    if (tweet.in_reply_to_screen_name) {
        // Append the link to the reply to the tweet
        cleanedTweet = cleanedTweet.concat(" http://twitter.com/statuses/", tweet.id_str);
    }

    return cleanedTweet;
};

Twitter.prototype.onTweet = function (tweet) {
    var self = this;

    // Is this a tweet from someone we're explicitly following
    if (tweet.user.id_str in self.streamObject.followerMap) {
        // Get the document for this follower
        var followDoc = self.streamObject.followerMap[tweet.user.id_str];

        // Now let's go ahead and send this tweet to any destinations we have
        if (followDoc.enabled && followDoc.tweets) {
            for (var tweetDest in followDoc.tweets) {
                var tweetDoc = followDoc.tweets[tweetDest];

                if (!tweetDoc.enabled) {
                    self.log.trace("Skipping Disabled Tweet Destination - Tweet ID: " + tweet.id_str);
                    continue;
                }

                // If this is a reply and we don't want replies, skip it...
                if (tweet.in_reply_to_screen_name && !tweetDoc.replies) {
                    self.log.trace("Skipping Reply Tweet - Tweet ID: " + tweet.id_str);
                    continue;
                }

                // TODO: Move this to reddis at some point
                // Ensure the destination tweet cache exists
                if (!self.streamObject.destTweets[tweetDest]) {
                    self.streamObject.destTweets[tweetDest] = {};
                }

                // If this is a retweet...
                if (tweet.retweeted_status) {
                    if (!tweetDoc.retweets) {
                        // Destination doesn't want retweets
                        self.log.trace("Skipping Re-Tweet - Tweet ID: " + tweet.id_str);
                        continue;
                    } else if (self.streamObject.destTweets[tweetDest][tweet.retweeted_status.id_str]) {
                        // Tweet has already been tweeted at this destination, skip!
                        self.log.trace("Skipping Repeated Re-Tweet - Tweet ID: " + tweet.id_str);
                        continue;
                    }
                }
                // This likely won't happen, but if we get a repeated tweet let's skip that too
                if (self.streamObject.destTweets[tweetDest][tweet.id_str]) {
                    self.log.trace("Skipping Repeated Tweet - Tweet ID: " + tweet.id_str);
                    continue;
                }

                var sanitizedTweet = self.cleanTweet(tweet);

                // Check for Regex matches
                if (tweetDoc.regex_matches && tweetDoc.regex_matches.length > 0) {
                    var regexMatch = false;

                    for (var i = 0, len = tweetDoc.regex_matches.length; i < len; i++) {
                        var regexStr = tweetDoc.regex_matches[i];
                        var regExp = new RegExp(regexStr);

                        if (regExp.test(sanitizedTweet)) {
                            regexMatch = true;
                            break;
                        }
                    }

                    if (!regexMatch) {
                        self.log.trace("Skipping Tweet with no Regex Match - Tweet ID: " + tweet.id_str);
                        continue;
                    }
                }

                // Construct the tweet message
                var message = "[Twitter] @" + tweet.user.screen_name + " wrote: " + sanitizedTweet;

                // Push the tweet!
                self.exastris.sayToDestination(tweetDoc.destination, message);

                // Push the tweet id into the tweet cache
                self.streamObject.destTweets[tweetDest][tweet.id_str] = {};

                self.log.trace(message);
            }
        }
    }
};

Twitter.prototype.onError = function (error) {
    var self = this;
    self.log.error("Twitter Error", error);
};

module.exports = new Twitter();