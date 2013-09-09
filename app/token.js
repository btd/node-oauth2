var crypto = require('crypto');

var config = require('./config');
var error = require('./error');

//TODO log errors

module.exports.generateAuthCode = function(callback) {
    crypto.randomBytes(config.oauth2.authCode.length, function (ex, buffer) {
        if (ex) return callback(new error.ServerError(ex.message));

        callback(false, crypto.createHash('sha1').update(buffer).digest('hex'));
    });
};

module.exports.generateAccessToken = function(callback) {
    crypto.randomBytes(config.oauth2.accessToken.length, function (ex, buffer) {
        if (ex) return callback(new error.ServerError(ex.message));

        callback(false, crypto.createHash('sha512').update(buffer).digest('hex'));
    });
};

var Token = function(token) {
    this._params = Object.keys(token);
    for(var i = 0; i < this._params.length; i++) {
        this[this._params[i]] = token[this._params[i]];
    }
};

Token.prototype = Object.create({
    expired: function() {
        return this.expires_in < (new Date()).getTime();
    }
});

module.exports.Token = Token;