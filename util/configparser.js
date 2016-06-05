function ConfigParser() {
}

ConfigParser.prototype.configureBristol = function(bristol, targets) {
    for (var i = 0, len = targets.length; i < len; i++) {
        var targetConfig = targets[i];

        if (!targetConfig.target) {
            console.log("Unable to parse bristol logger target, no target specified.");
            continue;
        }

        var target = bristol.addTarget(targetConfig.target, targetConfig.options);

        if (targetConfig.formatter) {
            target.withFormatter(targetConfig.formatter);
        }

        if (targetConfig.lowestSeverity) {
            target.withLowestSeverity(targetConfig.lowestSeverity);
        }

        if (targetConfig.highestSeverity) {
            target.withHighestSeverity(targetConfig.highestSeverity);
        }
    }

    return bristol;
}

module.exports = new ConfigParser();