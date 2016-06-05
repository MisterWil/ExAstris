function Source() {
}

var source_proto = {
    // {user} identifier - null = server created
    user: null,

    // The target (destination) creation point - null = server created
    target: null,

    // Creation time, last modified time
    created: new Date().getTime(),
    last_modified: new Date().getTime()
};
source_proto._datatype = 'source.json';

Source.prototype.source_proto = source_proto;
module.exports = new Source();