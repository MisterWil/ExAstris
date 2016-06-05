var source_proto = require('./source').source_proto;

function Channel() {
}

var channel_proto = {
    // Normalized channel name
    name: '',

    // Join/idle in the channel
    enabled: true,

    // Listen in the channel
    listening: true,

    // The {source} for this channel config
    source: source_proto
};
channel_proto._datatype = 'channel.json';

Channel.prototype.channel_proto = channel_proto;
module.exports = new Channel();