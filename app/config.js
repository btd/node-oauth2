var _ = require('lodash');

var common = {
    auth: {
        cookie: {
            secret: '18ee75a4720f85773ae9fa0756d806604815b65e62edde39402e86589aeb6ba5'
        }
    },
    oauth2: {
        authCode: {
            length: 256,
            expires_in: 60000 * 10
        },
        accessToken: {
            length: 1024
        }
    }
};

var config = {
    test: {

    },
    development: {

    },
    staging: {

    },
    production: {

    }
};

_.each(config, function(value, key) {
    config[key] = _.merge(value, common);
});

var env = process.env.NODE_ENV || 'development';

module.exports = config[env];