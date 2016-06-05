function Command() {
}

var command_proto = {
    // The {server} this command originated from
    server: {},

    // The {user} this command originated from
    user: {},

    // The source nickname this command originated from
    // may be different than the nickname supplied for user
    source: '',

    // The destination of the command response (channel | nickname)
    destination: '',

    // The full text portion of the command, unmodified
    text: '',

    // The input string after  removing addressing and punctuation ("ExAstris: Hello!" -> "hello")
    sanitizedText: '',

    // The irc client raw message details
    message: {},

    // The key that was matched using the sanitized text, null if passed to a generic message handler
    keyString: null,

    // The parsed arguments that follow the matched key string, empty if passed to a generic message handler
    arguments: [],
};
command_proto._datatype = 'command.json';

Command.prototype.command_proto = command_proto;
module.exports = new Command();