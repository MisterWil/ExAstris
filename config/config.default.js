var config = {};

config.nedb = {
    filename: 'datastores/exastris.db',
    autoload: true
};

config.log = [{
    target: 'console',
    formatter: 'human',
    lowestSeverity: 'trace',
    highestSeverity: 'error',
}, {
    target: 'file',
    formatter: 'human',
    lowestSeverity: 'warn',
    highestSeverity: 'error',
    options: {
        file: './logs/error.log'
    }
}];

/*, {
    target: 'loggly',
    lowestSeverity: 'info',
    highestSeverity: 'error',
    options: {
        token: 'Your-Token',
        subdomain: 'Your-Subdomain'
    }
}];*/

config.exastris = {
    modules: ['twitter'],
};

config.exastris.default_admin = {
    nickname: '',
    username: '',
    hostname: ''
};

config.exastris.default_server = {
    address: 'irc.server.com',
    port: 6667,
    secure: false,
    nickname: 'ExAstris',
    password: '',
    identify: false,
    delay: 2500,
    channels: ['#mychannel']
};

config.exastris.irc = {
    //port: 6667,
    //channels: ['#mydefaultchannel'],
    autoRejoin: true,
    autoConnect: true,
    debug: true,
    floodProtection: true,
    floodProtectionDelay: 1000,
    messageSplit: 512,
    showErrors: true,
    //secure: false,
    selfSigned: true,
    certExpired: true
};

config.twitter = {
    consumer_key: '',
    consumer_secret: '',
    access_token: '',
    access_token_secret: ''
};

module.exports = config;