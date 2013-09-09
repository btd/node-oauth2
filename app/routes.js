var express = require('express'),
    _ = require('lodash'),
    url = require('url');

var config = require('./config'),
    util = require('./util'),
    error = require('./error'),
    token = require('./token');

//middleware required for authorization part
var cookieParser = express.cookieParser();

var session = express.session({
    secret: config.auth.cookie.secret,
    store: new express.session.MemoryStore(),
    cookie: { path: '/oauth2/auth' }
});
var csrf = express.csrf();

var oauthSession = function(req, res, next) {
    if(!req.session.oauth2) {
        return res.send(403);
    }
    next();
};

var authorized = function(req, res, next) {
    if(!req.session.username) return res.send(401);
    next();
};

var nonEmptyString = function(value) {
    return value != null && _.isString(value) && value.length > 0;
};

var validUrl = function(value) {
    var parsedUrl = url.parse(value);
    return !!(parsedUrl && parsedUrl.protocol && parsedUrl.protocol.match(/https?:/));
};

var isCode = function(a) {
    return a === 'code';
};


var and = function(funcs) {
    return function(v) {
        var ok = true;
        for(var i = 0, len = funcs.length; i < len && ok; i++ ) {
            ok = ok && funcs[i](v);
        }
        return ok;
    };
};

var validateAuthorizationParams = _.pairs({
    'redirect_uri': [nonEmptyString, validUrl],
    'client_id': [nonEmptyString],
    'response_type': [isCode],
    'state': [nonEmptyString]
});

validateAuthorizationParams = _.map(validateAuthorizationParams, function(p) {
    return [p[0], and(p[1])];
});

module.exports = function(app, options) {

    app.namespace('/oauth2/auth', express.urlencoded(), cookieParser, session, function() {
        app.get('/', function(req, res) {
            var invalidParam = _.find(validateAuthorizationParams, function(prop) {
                return !prop[1](req.query[prop[0]]);
            });

            if(invalidParam) {
                res.render('error', {
                    param: invalidParam[0]
                });
            } else {
                req.session.oauth2 = {
                    state: req.query.state,
                    redirect_uri: req.query.redirect_uri,
                    client_id: req.query.client_id
                };

                res.redirect('./login');
            }
        });

        app.get('/login', csrf, oauthSession, function(req, res) {
            if(req.session.username) {
                res.redirect('../requestAccess');
                //TODO if app already authorized redirect immediate
            }

            res.render('auth', {
                _csrf: req.csrfToken(),
                error: req.query.error
            });
        });

        app.post('/loginAuth', csrf, oauthSession, function(req, res) {
            if(req.is('application/x-www-form-urlencoded') &&
                req.body &&
                options.matchUser(req.body.username, req.body.password)) {

                req.session.username = req.body.username;
                res.redirect('../requestAccess');

                //TODO if app already authorized redirect immediate
            } else {
                res.redirect('../login?error=invalid_user');
            }

        });

        app.get('/requestAccess', csrf, oauthSession, authorized, function(req, res) {
            var app = options.findApplicationByClientId(req.session.oauth2.client_id);
            if(app) {
                res.render('requestAccess', {
                    app: app,
                    _csrf: req.csrfToken()
                });
            } else {
                error.redirectError(req, res, new error.UnauthorizedClient);
            }
        });

        app.post('/requestAccessAuth', csrf, oauthSession, authorized, function(req, res) {
            if(req.is('application/x-www-form-urlencoded') &&
                req.body) {
                if(req.body.result === 'Yes') {
                    options.authCodeStore.get({
                        client_id: req.session.oauth2.client_id,
                        username: req.session.username
                    }, function(err, authCode) {
                        if(err) return err.redirectError(req, res, new error.ServerError(err.message));

                        if(authCode && !authCode.expired() && authCode.redirect_uri === req.session.oauth2.redirect_uri) {
                            var redirect_uri = util.urlAppendParams(req.session.oauth2.redirect_uri, {
                                'code': authCode.value,
                                'state' : req.session.oauth2.state
                            });

                            res.redirect(redirect_uri);
                        } else {
                            token.generateAuthCode(function(err, authCode) {
                                if(err) return error.redirectError(req, res, err);

                                var tokenObj = new token.Token({
                                    value: authCode,
                                    client_id: req.session.oauth2.client_id,
                                    redirect_uri: req.session.oauth2.redirect_uri,
                                    username: req.session.username,
                                    expires_in: (new Date()).getTime() + config.oauth2.authCode.expires_in
                                });

                                options.authCodeStore.put(tokenObj, function(err) {
                                    if(err) return error.redirectError(req, res, new error.ServerError(err.message));

                                    var redirect_uri = util.urlAppendParams(req.session.oauth2.redirect_uri, {
                                        'code': authCode,
                                        'state' : req.session.oauth2.state
                                    });

                                    req.session.oauth2 = null;

                                    res.redirect(redirect_uri);
                                });
                            });
                        }

                    });
                } else if(!req.body.result) {
                    error.redirectError(req, res, new error.InvalidRequest);
                } else {
                    error.redirectError(req, res, new error.AccessDenied);
                }
            } else {
                error.redirectError(req, res, new error.InvalidRequest);
            }
        });
    });

    var sendAccessTokenResponse = function(access_token, res) {
        res.send({
            access_token: access_token,
            token_type: 'Bearer'
        });
    };

    var generateAccessTokenAndSend = function(authCode, res) {
        token.generateAccessToken(function(err, access_token) {
            if(err) return error.sendError(res, new error.ServerError);

            var accessToken = new token.Token({
                username: authCode.username,
                value: access_token,
                client_id: authCode.client_id
            });

            options.accessTokenStore.put(accessToken, function(err) {
                if(err) return error.sendError(res, error.ServerError);

                sendAccessTokenResponse(access_token, res);

                options.authCodeStore.remove(authCode);
            });
        });
    };

    app.post('/oauth2/token', express.urlencoded(), function(req, res) {

        if(req.is('application/x-www-form-urlencoded') &&
            req.body &&
            req.body.grant_type === 'authorization_code' &&
            nonEmptyString(req.body.code) &&
            nonEmptyString(req.body.redirect_uri) &&
            nonEmptyString(req.body.client_id)) {

            options.authCodeStore.get(req.body.code, function(err, authCode) {
                if(err) return error.sendError(res, error.ServerError);

                if(authCode && !authCode.expired() && authCode.client_id === req.body.client_id && authCode.redirect_uri === req.body.redirect_uri) {
                    // if for this user already exists refresh_token reuse it

                    options.accessTokenStore.get({ client_id: authCode.client_id, username: authCode.username }, function(err, accessToken) {
                        if(err) return error.sendError(res, error.ServerError);

                        if(accessToken) {
                            sendAccessTokenResponse(accessToken.value, res);
                            options.authCodeStore.remove(authCode);
                        } else {
                            //by idea this should not be possible, but in any case
                            generateAccessTokenAndSend(authCode, res);
                        }
                    });

                } else {
                    error.sendError(res, new error.AccessDenied);
                }
            });

        } else {
            error.sendError(res, new error.InvalidRequest);
        }

    });

};