var app = require('./express');

require('./routes')(app, {
    matchUser: function(/*username, password*/) {
        return true;
    },
    findApplicationByClientId: function(/*client_id*/) {
        return {
            id: 123,
            name: 'My super app'
        };
    },
    authCodeStore: require('./memoryStore'),
    accessTokenStore: require('./memoryStore')
});

module.exports = app;