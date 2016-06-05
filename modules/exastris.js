var irc = require('irc');
var TreeModel = require('tree-model');
var merge = require('merge');
var diff = require('deep-diff').diff;

var Server = require('../datatypes/server'), server_proto = Server.server_proto;
var Channel = require('../datatypes/channel'), channel_proto = Channel.channel_proto;
var User = require('../datatypes/user'), user_proto = User.user_proto;
var User_Level = require('../datatypes/user_level');
var Command = require('../datatypes/command'), command_proto = Command.command_proto;

var moduleName = "ExAstris/1.0";
function ExAstris(log, db, config) {
    var self = this;

    self.log = log;
    self.db = db;
    self.config = config;

    self.log.info(moduleName + " Started");

    // Set up our command tree
    self.keyTreeModel = new TreeModel();
    self.keyTreeRoot = self.keyTreeModel.parse({
        id: "",
        children: []
    });

    // Set up our generic callback (ordered) array
    self.genericCallbacks = [];

    // Load our own callbacks
    self.registerCallbacks();

    // Load map of all modules by module name
    self.modules = {};
    self.loadModules();

    // Load map of {server}s by server identifier
    self.servers = {};
    self.loadServers();

    // Load map of {user}s by user identifier
    self.users = {};
    self.loadUsers();
}

/**
 * "Public" commands
 */

ExAstris.prototype.getCachedServer = function(serverIdentifier) {
    var self = this;

    return self.servers[serverIdentifier];
};

ExAstris.prototype.reply = function(command, message) {
    var self = this;

    if (self.isToChannel(command.server.ircClient, command.destination)) {
        message = command.source.concat(": ", message);
    }

    self.say(command, message);
};

ExAstris.prototype.sayToDestination = function (destination, message) {
    var self = this;

    var server = self.getCachedServer(destination.server);

    if (!server) {
        return false;
    }

    var sayParam = {
        server: server,
        destination: destination.target
    };

    self.say(sayParam, message);

    return true;
};

ExAstris.prototype.say = function(command, message) {
    var self = this;

    command.server.ircClient.say(command.destination, message);
    self.log.trace("Message Sent", {server: command.server, destination: command.destination, message: message});
};

ExAstris.prototype.isToChannel = function(ircClient, to) {
    return (ircClient.nick !== to);
};

ExAstris.prototype.isTargeted = function (ircClient, text) {
    // Channel messages must begin with nickname
    var nickname = ircClient.nick.toLowerCase();
    var words = text.split(" ");

    if (words && words.length > 0) {
        var firstWord = words[0].toLowerCase();

        if (firstWord.indexOf(nickname) > -1) {
            return true;
        }
    }

    return false;
};

/**
 * "Private" commands
 */

ExAstris.prototype.registerCallbacks = function() {
    var self = this;

    // TODO: Branching! "listening to [channel]" + "and leave" or "listen to" + "and leave" + "[channel]"
    // TODO: Inqueries! "listen to [channel]" -> "I'm not currently in [channel], would you like me to join?" -> {Positive: yes|okay|sure|yeah, Negative: no, Cancel: nevermind|never mind|{no reply}}
    self.register('listen to', true, 'listen to [channel] - Listen to a specific channel for commands.', self.handleListenTo.bind(self));
    self.register('start listening to', true, 'start listening to [channel] - Listen to a specific channel for commands.', self.handleListenTo.bind(self));
    self.register('stop listening to', true, 'stop listening to [channel] - Stop listening to a specific channel.', self.handleStopListeningTo.bind(self));
};

/**
 * Loads all the modules and calls their onLoad() method
 */
ExAstris.prototype.loadModules = function() {
    var self = this;

    if (self.config.exastris.modules) {
        var modules = self.config.exastris.modules;

        for (var i = 0, len = modules.length; i < len; i++) {
            var modulePath = modules[i].trim().toLowerCase();

            // Don't allow loading ourselves
            if (modulePath.indexOf('exastris') >= 0) {
                self.log.warn("Do not include ExAstris as a module for loading.");
                continue;
            }

            // If the modulepath isn't given, assume the module is relative to ourselves
            if (modulePath.substr(0, 2) !== './' || modulePath.substr(0,3) !== '../') {
                modulePath = './'.concat(modulePath);
            }

            // Require/Instance the module
            var module = require(modulePath);

            // Verify that we aren't loading a duplicate module
            if (module.moduleName in self.modules) {
                self.log.warn("Skipping duplicate module: " + module.moduleName);
                continue;
            }

            // Save the module to our module map
            self.modules[module.moduleName] = module;

            // Load the module
            module.onLoad(self, self.log, self.db, self.config);
        }
    }
};

/**
 * Startup function that will attempt to load servers from the database.
 */
ExAstris.prototype.loadServers = function() {
    var self = this;

    self.log.info("Loading servers...");

    self.db.find({_datatype: server_proto._datatype}, function (err, serverDocs) {
        if (err) {
            self.log.error("Error loading servers from database.", err);
            return;
        }

        if (serverDocs.length <= 0) {
            self.log.info("No servers found. Loading default server...");
            return self.loadDefaultServer();
        }

        serverDocs.forEach(function (serverDoc) {
            // Update called - will ensure database servers are all using the
            // most recent serverDoc proto.
            self.updateServer(serverDoc);
        });

    });
};

/**
 * Called if there are no servers when servers are loaded at startup.
 */
ExAstris.prototype.loadDefaultServer = function() {
    var self = this;

    self.db.count({_datatype: server_proto._datatype}, function (err, count) {
        if (err) {
            return self.log.error("Error counting servers from database.", err);
        }

        if (count > 0) {
            return self.log.error("Can not load default server in to database - " + count + " servers already exist.");
        }

        if (!self.config.exastris.default_server) {
            return self.log.warn("No default server found.");
        }

        // Get the expected array of strings from the default server config
        // and then delete it. We will recreate it below.
        var defaultChannels = self.config.exastris.default_server.channels;
        delete self.config.exastris.default_server.channels;

        var newServer = merge(true, server_proto, self.config.exastris.default_server);

        // Create the default channel documents and add them to the server document
        for (var i = 0, len = defaultChannels.length; i < len; i++) {
            var newChannel = merge(true, channel_proto, {name: defaultChannels[i]});
            newServer.channels[newChannel.name] = newChannel;
        }

        self.addServer(newServer, function(err) {
            if (err) {
                return self.log.error("Error inserting default server into database.", err);
            }
        });
    });
};

/**
 * Create a new IRC server instance and set up listeners.
 *
 * @param serverDoc     Required    The serverDoc that will be used to create the server.
 * @returns {Client}    The new IRC Client instance
 */
ExAstris.prototype.startupServer = function(serverDoc) {
    var self = this;

    var serverIdentifier = Server.getIdentifier(serverDoc);

    // Merge our serverDoc with the ircConfig
    var ircClientConfig = merge(true, self.config.exastris.irc, serverDoc);

    // Strip the channels from the irc client config, we'll handle that on our own
    delete ircClientConfig.channels;

    self.log.info("Starting server " + serverIdentifier + "...");

    // Create the new irc client connection
    var ircClient = new irc.Client(ircClientConfig.address, ircClientConfig.nickname, ircClientConfig);

    // Add our listeners to the irc client
    ircClient.addListener('message', self.handleMessage.bind(self, serverIdentifier));
    ircClient.addListener('notice', self.handleNotice.bind(self, serverIdentifier));
    ircClient.addListener('error', self.handleError.bind(self, serverIdentifier));
    ircClient.addListener('netError', self.handleError.bind(self, serverIdentifier)); // Undocumented :(
    ircClient.addListener('registered', self.handleRegistered.bind(self, serverIdentifier));

    return ircClient;
};

/**
 * Removes all listeners and disconnects from an irc server if the server is currently connected.
 *
 * @param serverIdentifier  Required    The serverIdentifier of the server to shutdown.
 */
ExAstris.prototype.shutdownServer = function(serverIdentifier) {
    var self = this;

    var server = self.servers[serverIdentifier];

    if (server) {
        self.log.info("Shutting down server " + serverIdentifier + "...");

        // Remove listeners
        server.ircClient.removeListener('message', self.handleMessage.bind(self, serverIdentifier));
        server.ircClient.removeListener('notice', self.handleNotice.bind(self, serverIdentifier));
        server.ircClient.removeListener('error', self.handleError.bind(self, serverIdentifier));
        server.ircClient.removeListener('netError', self.handleError.bind(self, serverIdentifier));
        server.ircClient.removeListener('registered', self.handleRegistered.bind(self, serverIdentifier));

        // Disconnect from server
        if (server.ircClient.conn.readyState === 'open') {
            server.ircClient.disconnect("Shutdown requested... Goodbye!");
            self.log.info("Disconnected from server: " + serverIdentifier);
        }
    }
};

/**
 * Updates the local server cache with the most recent serverDoc.
 *
 * @param serverDoc     Required    The serverDoc to cache.
 * @param oldServerDoc  Optional    If replacing a serverDoc and the identifier has changed, passing this
 *                                  value will ensure that the old server is removed properly.
 */
ExAstris.prototype.cacheServer = function(serverDoc, oldServerDoc) {
    var self = this;

    var serverIdentifier = Server.getIdentifier(serverDoc);
    var oldServerIdentifier = serverIdentifier;

    // If we're replacing a server with a new identifier
    if (oldServerDoc) {
        oldServerIdentifier = Server.getIdentifier(oldServerDoc);
    }

    var ircClient = null;

    // If the server has been previously cached
    if (oldServerIdentifier in self.servers) {
        if (serverIdentifier !== oldServerIdentifier) {
            // Shutdown and delete the old cached server as the identifier (server:port has changed)
            self.shutdownServer(oldServerIdentifier);
            delete self.servers[oldServerIdentifier];

            // TODO: Notify modules (event service?) that the server identifier has changed
        } else {
            // Keep the existing irc client instance
            ircClient = self.servers[oldServerIdentifier].ircClient;
        }

        self.log.info("Replacing cached server " + oldServerIdentifier + "...");
    } else {
        self.log.info("Caching server: " + serverIdentifier);
    }

    // If we don't have an old IRC client instance to use, create a new one
    if (!ircClient) {
        ircClient = self.startupServer(serverDoc);
    }

    // Cache the server
    self.servers[serverIdentifier] = {
        serverDoc: serverDoc,
        ircClient: ircClient
    };
};

/**
 * Will retrieve one server from the database that matches the address and port.
 *
 * @param address|serverDoc Required    The address of the server to find or the serverDoc to find.
 * @param port|callback     Req|Opt     The port of the server to find or the callback.
 * @param callback          Required    The callback when a server is found in the form function(err, serverDoc)
 */
ExAstris.prototype.getServer = function(address, port, callback) {
    var self = this;

    if (!callback) {
        var serverDoc = address;

        callback = port;
        address = serverDoc.address;
        port = serverDoc.port;
    }

    var query = {
        address: address,
        port: port,
        _datatype: server_proto._datatype
    };

    self.db.findOne(query, function (err, serverDoc) {
        if (err) {
            return callback (err);
        }

        return callback (null, serverDoc);
    });
};

/**
 * Add a new server to the database. Calls cacheServer() automatically. If the
 * user already exists then an update is performed automatically.
 *
 * @param newServerDoc          Required    The new serverDoc to be added.
 * @param userIdent|callback    Optional    The userIdent of the one adding the server, or the callback.
 * @param target                Optional    The target from where the above userIdent was called.
 * @param callback              Optional    The callback when a server is added in the form function(err, latestServerDoc)
 */
ExAstris.prototype.addServer = function(newServerDoc, userIdent, target, callback) {
    var self = this;

    if (!callback) {
        callback = userIdent;
        userIdent = null;
        target = null;
    }

    if (!callback) {
        callback = function(err){if (err) {self.log.error("addServer() Error", err);}};
    }

    // If the newServerDoc has a db _id field, then we want to update instead
    if (newServerDoc._id) {
        return self.updateServer(newServerDoc, callback);
    }

    self.getServer(newServerDoc, function(err, serverDoc) {
        if (err) {
            return callback(err);
        }

        // If the server exists, then we should attempt to update instead.
        if (serverDoc) {
            return self.updateServer(newServerDoc, callback);
        }

        // Merge serverDoc into the prototype - This ensures that the inserted server has all fields
        var finalServerDoc = merge(true, server_proto, newServerDoc);

        // Update the source user and target - nulls allowed (nulls are considered inserted/updated by server)
        finalServerDoc.source.user = userIdent;
        finalServerDoc.source.target = target;

        self.db.insert(finalServerDoc, function(err){
            if (err) {
                return callback(err);
            }

            // Update the local cache
            self.cacheServer(finalServerDoc);

            return callback(null, finalServerDoc);
        });
    });
};

/**
 * Updates a server in the database. Calls loadUser() automatically.
 *
 * @param serverDoc             Required - The serverDoc to change with changed values.
 * @param userIdent|callback    Optional - The userIdent of the one updating the server, or the callback.
 * @param target                Optional - The target from where the above userIdent was called.
 * @param callback              Optional - The callback when a server is updated in the form function(err, lastestServerDoc)
 */
ExAstris.prototype.updateServer = function(serverDoc, userIdent, target, callback) {
    var self = this;

    if (!callback) {
        callback = userIdent;
        userIdent = null;
        target = null;
    }

    if (!callback) {
        callback = function(err){if (err) {self.log.error("updateServer() Error", err);}};
    }

    self.getServer(serverDoc, function(err, oldServerDoc) {
        if (err) {
            return callback(err);
        }

        // Merge serverDoc into the oldServerDoc into the prototype
        // this will merge changes and also ensure any missing fields
        // are saved as well.
        var finalServerDoc = merge(true, server_proto, oldServerDoc, serverDoc);

        // If there are no changes, then don't bother running an update.
        if (!diff(oldServerDoc, finalServerDoc)) {
            // Update the local cache
            self.cacheServer(finalServerDoc);

            return callback(null, finalServerDoc);
        }

        // Update the source user and target - nulls allowed (nulls are considered inserted/updated by server)
        finalServerDoc.source.user = userIdent;
        finalServerDoc.source.target = target;

        self.db.update({_id: finalServerDoc._id}, finalServerDoc, {}, function(err){
            if (err) {
                return callback(err);
            }

            // Update the local cache, passing the oldServerDoc for shutdown purposes
            self.cacheServer(finalServerDoc, oldServerDoc);

            return callback(null, finalServerDoc);
        });
    });
};

/**
 * Startup function that will attempt to load users from the database.
 */
ExAstris.prototype.loadUsers = function() {
    var self = this;

    self.log.info("Loading users...");

    self.db.find({_datatype: user_proto._datatype}, function (err, userDocs) {
        if (err) {
            self.log.error("Error loading users from database.", err);
            return;
        }

        if (userDocs.length === 0) {
            self.log.info("No users found. Loading default user...");
            return self.loadDefaultUser();
        }

        userDocs.forEach(function (userDoc) {
            // Update called - will ensure database users are all using the
            // most recent userDoc proto.
            self.updateUser(userDoc);
        });

    });
};

/**
 * Called if there are no users when users are loaded at startup.
 */
ExAstris.prototype.loadDefaultUser = function() {
    var self = this;

    self.db.count({_datatype: user_proto._datatype}, function (err, count) {
        if (err) {
            return self.log.error("Error counting users from database.", err);
        }

        if (count > 0) {
            return self.log.error("Can not load default user in to database - " + count + " users already exist.");
        }

        if (!self.config.exastris.default_admin) {
            return self.log.warn("No default user found.");
        }

        var newUser = merge(true, user_proto, self.config.exastris.default_admin);

        self.addUser(newUser, function(err) {
            if (err) {
                return self.log.error("Error inserting default user into database.", err);
            }
        });
    });
};

/**
 * Updates the local cache with a new userDoc.
 *
 * @param userDoc   Required    The userDoc to cache.
 */
ExAstris.prototype.cacheUser = function(userDoc) {
    var self = this;

    if (User.getIdentifier(userDoc) in self.users) {
        self.log.warn("Replacing cached user: " + User.getIdentifier(userDoc));
    } else {
        self.log.info("Caching user: " + User.getIdentifier(userDoc));
    }

    self.users[User.getIdentifier(userDoc)] = userDoc;
};

/**
 * Will retrieve one user from the database that matches the nickname OR
 * the username and hostname.
 *
 * @param nickname|userDoc  Required    The nickname of the user to find or the userDoc of the user to find.
 * @param username|callback Req|Opt     The username of the user to find or the callback.
 * @param hostname          Req|Opt     The hostname of the user to find.
 * @param callback          Required    The callback when a user is found in the form function(err, userDoc)
 */
ExAstris.prototype.getUser = function(nickname, username, hostname, callback) {
    var self = this;

    if (!callback) {
        var userDoc = nickname;

        callback = username;
        nickname = userDoc.nickname;
        username = userDoc.username;
        hostname = userDoc.hostname;
    }

    var query = {
        $or: [
            {nickname: nickname},
            {
                $and: [
                    {username: username},
                    {hostname: hostname}
                ]
            }
        ],
        _datatype: user_proto._datatype
    };


    self.db.findOne(query, function (err, userDoc) {
        if (err) {
            return callback (err);
        }

        return callback (null, userDoc);
    });
};

/**
 * Add a new user to the database. Calls cacheUser() automatically, which add/updates
 * the cached value for the user. If the user already exists then an update is
 * performed automatically.
 *
 * @param newUserDoc            Required    The new userDoc to be added.
 * @param userIdent|callback    Optional    The userIdent of the one adding the user, or the callback.
 * @param target                Optional    The target from where the above userIdent was called.
 * @param callback              Optional    The callback when a user is added in the form function(err, lastestUserDoc)
 */
ExAstris.prototype.addUser = function(newUserDoc, userIdent, target, callback) {
    var self = this;

    if (!callback) {
        callback = userIdent;
        userIdent = null;
        target = null;
    }

    if (!callback) {
        callback = function(err){if (err) {self.log.error("addUser() Error", err);}};
    }

    // If the newUserDoc has a db _id field, then we want to update instead
    if (newUserDoc._id) {
        return self.updateUser(newUserDoc, callback);
    }

    self.getUser(newUserDoc, function(err, userDoc) {
        if (err) {
            return callback(err);
        }

        // If the user exists, then we should attempt to update instead.
        if (userDoc) {
            return self.updateUser(newUserDoc, callback);
        }

        // Merge userDoc into the prototype - This ensures that the inserted user has all fields
        var finalUserDoc = merge(true, user_proto, newUserDoc);

        // Update the source user and target - nulls allowed (nulls are considered inserted/updated by server)
        finalUserDoc.source.user = userIdent;
        finalUserDoc.source.target = target;

        self.db.insert(finalUserDoc, function(err){
            if (err) {
                return callback(err);
            }

            // Update the local cache
            self.cacheUser(finalUserDoc);

            return callback(null, finalUserDoc);
        });
    });
};

/**
 * Updates a user in the database. Calls cacheUser() automatically, which add/updates
 * the cached value for the user.
 *
 * @param userDoc               Required    The userDoc to change with changed values.
 * @param userIdent|callback    Optional    The userIdent of the one updating the user, or the callback.
 * @param target                Optional    The target from where the above userIdent was called.
 * @param callback              Optional    The callback when a user is updated in the form function(err, lastestUserDoc)
 */
ExAstris.prototype.updateUser = function(userDoc, userIdent, target, callback) {
    var self = this;

    if (!callback) {
        callback = userIdent;
        userIdent = null;
        target = null;
    }

    if (!callback) {
        callback = function(err){if (err) {self.log.error("updateUser() Error", err);}};
    }

    self.getUser(userDoc, function(err, oldUserDoc) {
        if (err) {
            return callback(err);
        }

        // Merge userDoc into the oldUserDoc into the prototype
        // this will merge changes and also ensure any missing fields
        // are saved as well.
        var finalUserDoc = merge(true, user_proto, oldUserDoc, userDoc);

        // If there are no changes, then don't bother running an update.
        if (!diff(oldUserDoc, finalUserDoc)) {
            // Update the local cache
            self.cacheUser(finalUserDoc);

            return callback(null, finalUserDoc);
        }

        // Update the source user and target - nulls allowed (nulls are considered inserted/updated by server)
        finalUserDoc.source.user = userIdent;
        finalUserDoc.source.target = target;

        self.db.update({_id: finalUserDoc._id}, finalUserDoc, {}, function(err){
            if (err) {
                return callback(err);
            }

            // Update the local cache
            self.cacheUser(finalUserDoc);

            return callback(null, finalUserDoc);
        });
    });
};

ExAstris.prototype.addGeneric = function(description, callback, userLevel, targeted, index) {
    var self = this;

    userLevel = userLevel ? userLevel : User_Level.default;
    targeted = targeted === true ? true : false;
    index = index ? index : self.genericCallbacks.length;

    var genericCallback = {
        targeted: targeted,
        userLevel: userLevel,
        description: description,
        callback: callback
    };

    self.genericCallbacks.splice(index, 0, genericCallback);
};

ExAstris.prototype.register = function(key, userLevel, description, callback) {
    var self = this;

    // TODO: Natural Treebank Tokenizer
    // Split the key into it's component parts
    var keyArr = key.split(" ");

    if (keyArr && keyArr.length > 0) {

        // Loop through each key component and continue pulling or creating nodes until we reach the end of the keyTreeModel
        var parentNode = self.keyTreeRoot;
        var keyNode;
        var index = 0;
        do {
            var currentKey = self.cleanKey(keyArr[index++]);

            if (keyNode) {
                parentNode = keyNode;
            }

            keyNode = parentNode.first(function (node) {
                return node.model.id === currentKey;
            });

            if (!keyNode) {
                keyNode = self.keyTreeModel.parse({
                    id: currentKey
                });

                parentNode.addChild(keyNode);
            }
        } while (index < keyArr.length);

        // keyNode should now be the last component in the given key
        // if a callback has already been defined then this key has been used
        if (keyNode.callback) {
            self.log.warn("Attempted to register command that is already in use.", {key: key, admin: admin});
            return false;
        }

        // Otherwise, add the callback and admin status to the new key
        keyNode.key = key;
        keyNode.callback = callback;
        keyNode.userLevel = userLevel;
        keyNode.description = description;

        self.log.debug("Successfully registered command: " + key)

        return true;
    }

    // Invalid key given
    return false;
};

ExAstris.prototype.cleanKey = function(key) {
    var cleanedKey = key.toLowerCase();
    return cleanedKey.replace(/\W/g, '');
};


ExAstris.prototype.findKeyNode = function(text) {
    var self = this;

    var keyArr = text.split(" ");

    if (keyArr && keyArr.length > 0) {
        var validKeyNode;
        var validIndex;

        // Loop through each key component pull nodes until we reach a leaf, building the key array
        var lastKeyNode = self.keyTreeRoot;
        var index = 0;
        do {
            var currentKey = self.cleanKey(keyArr[index++]);

            var currentKeyNode = lastKeyNode.first(function (node) {
                return node.model.id === currentKey;
            });

            if (!currentKeyNode) {
                break;
            }

            if (currentKeyNode.callback) {
                validKeyNode = currentKeyNode;
                validIndex = index;
            }

            lastKeyNode = currentKeyNode;
        } while (index < keyArr.length);

        if (validKeyNode) {
            var keys = keyArr.splice(0, validIndex);

            return {
                node: validKeyNode,
                keys: keys,
                args: keyArr
            };
        }
    }
};

ExAstris.prototype.cleanInput = function(ircClient, text) {
    var self = this;
    var cleanedInput = text;

    // Remove any targeted (Nick: Command) input
    if (self.isTargeted(ircClient, text)) {
        var words = text.split(" ");
        cleanedInput = text.substring(words[0].length+1)
    }

    // TODO: Natural Treebank Tokenizer

    // Remove any sentence-ending characters
    var lastChar = cleanedInput.substring(cleanedInput.length-1, cleanedInput.length);

    if (['.', '?', '!'].indexOf(lastChar) > -1) {
        cleanedInput = cleanedInput.substring(0, cleanedInput.length-1);
    }

    return cleanedInput.toLowerCase();
};

ExAstris.prototype.listenToChannel = function(command, channel, callback) {
    var self = this;

    var serverDoc = command.server.serverDoc;

    if (channel in serverDoc.channels && channel.enabled && channel.listening) {
        return callback({
            success: false,
            message: "It would appear that I'm already listening to " + channel + "!"
        });
    }

    // Add the channel to the map
    self.channelMap[channel] = true;

    // Join the channel if we haven't already
    if (!(channel in self.ircClient.chans)) {
        self.ircClient.join(channel);
    }

    // Construct the new channel list
    var channels = [];
    for (var key in self.channelMap) {
        channels.push(key);
    }

    // Push the changes to our db
    self.db.update({_id: 'channels'}, {_id: 'channels', channels: channels}, {upsert: true}, function(err, numReplaced) {
        if (err) {
            self.log.error("Error updating channels in database.", err);
            return;
        }

        if (numReplaced === 0) {
            self.log.error("Failed to upsert new channel list.", {channels: channels});
            return;
        }
    });

    self.log.debug("Now listening to a new channel: " + channel);
    return true;
};

ExAstris.prototype.ignoreChannel = function(channel) {
    var self = this;

    if (!(channel in self.channelMap)) {
        self.log.debug("Attempted to remove channel that is not being listened to: " + channel);
        return false;
    }

    // Remove the channel from the map
    delete self.channelMap[channel];

    // Part the channel if we haven't already and only if it's not a default channel
    if (channel in self.ircClient.chans && self.ircClient.opt.channels.indexOf(channel) === -1) {
        // TODO: Add a callback to allow for talking before parting?
        self.ircClient.part(channel);
    }

    // Construct the new channel list
    var channels = [];
    for (var key in self.channelMap) {
        channels.push(key);
    }

    // Push the changes to our db
    self.db.update({_id: 'channels'}, {_id: 'channels', channels: channels}, {upsert: true}, function(err, numReplaced) {
        if (err) {
            self.log.error("Error updating channels in database.", err);
            return;
        }

        if (numReplaced === 0) {
            self.log.error("Failed to upsert new channel list.", {channels: channels});
            return;
        }
    });

    self.log.debug("No longer listening to channel: " + channel);
    return true;
};

ExAstris.prototype.addAuthorizedUser = function(nickname) {
    var self = this;

    // TODO
    self.ircClient.whois(nickname, function(info) {
        console.log(info);
    });
};

/**
 * Registered Callback Handlers
 */

ExAstris.prototype.handleListenTo = function(command) {
    var self = this;

    if (command.arguments.length === 0) {
        return self.reply(command, "You forgot to include a channel to listen to.");
    }

    var target = command.arguments[0];

    self.listenToChannel(command, target, function(result) {
        self.reply(command, result.message);
    });
};

ExAstris.prototype.handleStopListeningTo = function(command) {
    var self = this;

    if (command.arguments.length === 0) {
        return self.directReply(from, to, "You forgot to include a channel to stop listening to.");
    }

    var target = command.arguments[0];

    if (self.ignoreChannel(target)) {
        self.reply(command, "I have stopped listening to " + target + "!");
    } else {
        self.reply(command, "I am not listening to " + target + " right now.");
    }
};

/**
 * IRC Client Callback Handlers
 */

ExAstris.prototype.handleMessage = function(serverIdentifier, from, to, text, message) {
    var self = this;

    // Find the server
    var server = self.servers[serverIdentifier];
    if (!server) {
        return self.log.warn("handleMessage() called with no serverIdentifier: " + serverIdentifier);
    }

    var serverDoc = server.serverDoc;

    // Build the current user document
    var userIdentifier = User.buildIdentifier(message.nick, message.user, message.host);
    var user = self.users[userIdentifier];
    user = merge(true, user_proto, user);

    if (user.level === User_Level.banned) {
        return self.log.debug("Banned user blocked: " + message.nick + " - " + userIdentifier);
    }

    var source = from;
    var destination = from;

    if (self.isToChannel(server.ircClient, to)) {
        // The destination for messages will be the channel
        destination = to.toLowerCase();

        var channel = serverDoc.channels[destination];
        if (!channel || !channel.enabled || !channel.listening) {
            return self.log.debug("Message ignored on disabled/ignored channel " + destination + " from " + message.nick);
        }
    }

    self.handleCommand(server, user, source, destination, text, message);
};

ExAstris.prototype.handleCommand = function(server, user, source, destination, text, message) {
    var self = this;

    // Clean up the input by removing anything we deem to be "extra"
    var cleanInput = self.cleanInput(server.ircClient, text);

    // Find the node which matches the text
    var keyNode = self.findKeyNode(cleanInput);

    if (keyNode) {
        if (self.isToChannel(server.ircClient, destination) && !self.isTargeted(server.ircClient, text)) {
            return self.log.trace("Un-targeted command ignored on channel " + destination + " from user " + message.nick, {text: text});
        }

        if (user.userLevel < keyNode.userLevel) {
            return self.log.info("Command ignored on channel " + destination + " from unauthorized user " + message.nick + "(" + user.userLevel + ")", {text: text});
        }

        var commandParameter = {
            server: server,
            user: user,
            source: source,
            destination: destination,
            text: text,
            sanitizedText: cleanInput,
            message: message,
            keyString: keyNode.keys,
            arguments: keyNode.args
        };
        commandParameter = merge(true, command_proto, commandParameter);
        keyNode.node.callback(commandParameter);

        self.log.trace("Registered Command Executed", commandParameter);
    } else {
        self.handleGenericMessage(server, user, source, destination, text, message);
        //self.log.trace("Received Unrecognized Command", {message: message});
    }
};

ExAstris.prototype.handleGenericMessage = function(server, user, source, destination, text, message) {
    var self = this;

    var targeted = true;

    // Targeted is only false if this message was from a channel and the message wasn't targeted at the bot specifically
    if (self.isToChannel(server.ircClient, destination) && !self.isTargeted(server.ircClient, text)) {
        targeted = false;
    }

    // Clean up the input by removing anything we deem to be "extra"
    var cleanInput = self.cleanInput(server.ircClient, text);

    // Loop through all generic message callbacks
    for (var i = 0, len = self.genericCallbacks.length; i < len; i++) {
        var genericCallback = self.genericCallbacks[i];

        // Skip targeted generic handlers when the message is not targeted
        if (!targeted && genericCallback.targeted) {
            continue;
        }

        if (user.userLevel < genericCallback.userLevel) {
           continue;
        }

        var commandParameter = {
            server: server,
            user: user,
            source: source,
            destination: destination,
            text: text,
            sanitizedText: cleanInput,
            message: message
        };
        commandParameter = merge(true, command_proto, commandParameter);

        var result = genericCallback.callback(commandParameter);

        // If our callback returned true, we consider this message as handled/eaten
        if (result === true) {
            return self.log.trace("Generic Message Handled", {message: message});
        }
    }

    if (targeted) {
        self.log.trace("Targeted Message Command/Generic Handler Not Found", {message: message});
    } else {
        self.log.trace("Generic Message Ignored", {message: message});
    }
};

ExAstris.prototype.handleError = function(serverIdentifier, message) {
    var self = this;
    self.log.error("Server error (" + serverIdentifier + "): " + message);
};

ExAstris.prototype.handleNotice = function(serverIdentifier, nick, to, text, message) {
    var self = this;

    if (nick && nick.toLowerCase() === 'nickserv') {
        self.log.info("Nickserv notice (" + serverIdentifier + "): " + text);
    } else {
        self.log.trace("Notice Received", {serverIdentifier: serverIdentifier, nick: nick, to: to, text: text});
    }
};

ExAstris.prototype.handleRegistered = function (serverIdentifier, message) {
    var self = this;

    var server = self.servers[serverIdentifier];

    if (!server) {
        return self.log.error("Unable to find server with given identifier: " + serverIdentifier);
    }

    var serverDoc = server.serverDoc;

    self.log.info("Connected to server: " + serverIdentifier);

    for (var channel in serverDoc.channels) {
        var channelDoc = serverDoc.channels[channel];

        if (channelDoc.enabled) {
            self.log.info("Joining channel: " + serverIdentifier + channelDoc.name);
            server.ircClient.join(channelDoc.name);
        }
    }
};

/**
 * Other Handlers
 */

ExAstris.prototype.handleShutdown = function (callback) {
    var self = this;

    self.log.info("Shutdown detected...");

    for (var serverIdentifier in self.servers) {
        // TODO: Countdown latch to wait for all servers to disconnect?
        self.shutdownServer(serverIdentifier);
    }

    return callback();
};

module.exports = ExAstris;