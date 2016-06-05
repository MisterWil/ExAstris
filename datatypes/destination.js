function Destination() {
}

Destination.prototype.getIdentifier = function(destination) {
    return destination.target.concat('@', destination.server);
}

Destination.prototype.buildIdentifier = function(server, target) {
    return target.concat('@', server);
}

var destination_proto = {
    // {server} identifier
    server: null,

    // channel or user
    target: null,
}
destination_proto._datatype = 'destination.json';

Destination.prototype.destination_proto = destination_proto;
module.exports = new Destination();