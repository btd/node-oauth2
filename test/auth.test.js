var should = require('should');
var request = require('supertest');

var jsdom = require('jsdom');
var Cookie = require('cookie-jar');

var app = require('../app/express');

var Store = require('../app/memoryStore');

var goodUser = { username: 'user', password: '123' };

var querystring = require('querystring');

require('../app/routes')(app, {
    matchUser: function (username, password) {
        return username === goodUser.username && password === goodUser.password;
    },
    findApplicationByClientId: function (client_id) {
        return client_id === "123" && {
            client_id: 123,
            name: 'My super app'
        };
    },
    authCodeStore: new Store,
    accessTokenStore: new Store
});

var url = require('url');
var path = require('path');


describe('OAuth2', function () {

    describe('/oauth2/auth', function () {

        it('should warn user with error page when no query parameters', function (done) {
            request(app)
                .get('/oauth2/auth')
                .expect('Content-Type', /html/)
                .expect(/error/i)
                .end(done);
        });

        it('should warn user with error page when no at least one parameter missing', function (done) {
            request(app)
                .get('/oauth2/auth?response_type=code&client_id=aaa&state=aaaa')
                .expect('Content-Type', /html/)
                .expect(/error.*redirect_uri/ig)
                .end(done);
        });

        it('should warn user with error page when no at least one parameter empty', function (done) {
            request(app)
                .get('/oauth2/auth?response_type=code&client_id=aaa&state=aaaa&redirect_uri=')
                .expect('Content-Type', /html/)
                .expect(/error.*redirect_uri/ig)
                .end(done);
        });

        it('should warn user with error page when response_code not a "code"', function (done) {
            request(app)
                .get('/oauth2/auth?response_type=code1&client_id=aaa&state=aaaa&redirect_uri=http://a')
                .expect('Content-Type', /html/)
                .expect(/error.*response_type/ig)
                .end(done);
        });

        it('should warn user with error page when response_code not a "code"', function (done) {
            request(app)
                .get('/oauth2/auth?response_type=code1&client_id=aaa&state=aaaa&redirect_uri=http://a')
                .expect('Content-Type', /html/)
                .expect(/error.*response_type/ig)
                .end(done);
        });

        it('should warn user with error page when redirect_uri not a redirectable', function (done) {
            request(app)
                .get('/oauth2/auth?response_type=code1&client_id=aaa&state=aaaa&redirect_uri=file:C://')
                .expect('Content-Type', /html/)
                .expect(/error.*redirect_uri/ig)
                .end(done);
        });

        it('should show login form if all 4 parameters filled correctly', function (done) {
            request(app)
                .get('/oauth2/auth')
                .query({ response_type: 'code', client_id: 'aaa', state: 'aaaa', redirect_uri: 'http://a' })
                .expect('Location', /\/oauth2\/auth\/(\.\/)?login/)
                .expect(302)
                .end(done);
        });
    });

    describe('/oauth2/auth/login', function () {
        it('should not never shown if user come in to this url before visiting /oauth2/auth', function (done) {
            request(app)
                .get('/oauth2/auth/login')
                .expect(403)
                .end(done);

        });

        it('should show sign in page if user come in after redirect from /oauth2/auth', function (done) {

            request(app)
                .get('/oauth2/auth?response_type=code&client_id=aaa&state=aaaa&redirect_uri=http://a')
                .end(function (err, res) {
                    if (err) return done(err);

                    var authCookie = new Cookie(res.headers['set-cookie'][0]);

                    request(app)
                        .get('/oauth2/auth/login')
                        .set('Cookie', authCookie.name + '=' + authCookie.value)
                        .expect('Content-Type', /html/)
                        .expect(200)
                        .end(done);

                });
        });

        it('should have csrf field', function (done) {
            request(app)
                .get('/oauth2/auth?response_type=code&client_id=aaa&state=aaaa&redirect_uri=http://a')
                .end(function (err, res) {
                    if (err) return done(err);

                    var authCookie = new Cookie(res.headers['set-cookie'][0]);

                    request(app)
                        .get('/oauth2/auth/login')
                        .set('Cookie', authCookie.name + '=' + authCookie.value)
                        .end(function (err, res) {
                            jsdom.env(res.text, function (err, window) {
                                    if (err) return done(err);

                                    var csrfField = window.document.querySelectorAll('#form-signin input[name=_csrf]')[0];

                                    csrfField.getAttribute('name').should.be.eql('_csrf');
                                    csrfField.getAttribute('value').should.not.be.empty;

                                    done();
                                }
                            );
                        });

                });
        });
    });

    describe('/oauth2/auth/loginAuth', function () {
        it('should be available for POST', function (done) {
            request(app)
                .get('/oauth2/auth/loginAuth')
                .expect(404, function (err, res) {
                    if (err) return done(err);

                    request(app)
                        .post('/oauth2/auth/loginAuth')
                        .expect(403, done);
                });
        });

        it('should not allow to POST everyone', function (done) {
            request(app)
                .post('/oauth2/auth/loginAuth')
                .expect(403, done);
        });

        it('should allow to post only user that visit 2 previous url (cookie and csrf protection)', function (done) {
            request(app)
                .get('/oauth2/auth?response_type=code&client_id=aaa&state=aaaa&redirect_uri=http://a')
                .end(function (err, res) {
                    if (err) return done(err);

                    var authCookie = new Cookie(res.headers['set-cookie'][0]);

                    request(app)
                        .get('/oauth2/auth/login')
                        .set('Cookie', authCookie.name + '=' + authCookie.value)
                        .end(function (err, res) {

                            jsdom.env(res.text, function (err, window) {
                                    if (err) return done(err);

                                    var csrfField = window.document.querySelectorAll('#form-signin input[name=_csrf]')[0];

                                    request(app)
                                        .post('/oauth2/auth/loginAuth')
                                        .type('urlencoded')
                                        .send({ _csrf: csrfField.getAttribute('value') })
                                        .set('Cookie', authCookie.name + '=' + authCookie.value)
                                        .expect(302, done);
                                }
                            );


                        });

                });
        });

        it('should redirect user back to login page when user not found or no form parameters', function (done) {
            request(app)
                .get('/oauth2/auth?response_type=code&client_id=aaa&state=aaaa&redirect_uri=http://a')
                .end(function (err, res) {
                    if (err) return done(err);

                    var authCookie = new Cookie(res.headers['set-cookie'][0]);

                    request(app)
                        .get('/oauth2/auth/login')
                        .set('Cookie', authCookie.name + '=' + authCookie.value)
                        .end(function (err, res) {

                            jsdom.env(res.text, function (err, window) {
                                    if (err) return done(err);

                                    var csrfField = window.document.querySelectorAll('#form-signin input[name=_csrf]')[0];

                                    request(app)
                                        .post('/oauth2/auth/loginAuth')
                                        .type('urlencoded')
                                        .send({ _csrf: csrfField.getAttribute('value') })
                                        .set('Cookie', authCookie.name + '=' + authCookie.value)
                                        .expect('Location', '/oauth2/auth/loginAuth/../login?error=invalid_user')
                                        .expect(302, done);
                                }
                            );


                        });

                });
        });

        it('should redirect user to next step when all 3 parameters correct', function (done) {
            request(app)
                .get('/oauth2/auth?response_type=code&client_id=123&state=aaaa&redirect_uri=http://a')
                .end(function (err, res) {
                    var authCookie = new Cookie(res.headers['set-cookie'][0]);

                    request(app)
                        .get('/oauth2/auth/login')
                        .set('Cookie', authCookie.name + '=' + authCookie.value)
                        .end(function (err, res) {

                            jsdom.env(res.text, function (err, window) {
                                    var csrf = window.document.querySelectorAll('#form-signin input[name=_csrf]')[0].getAttribute('value');

                                    request(app)
                                        .post('/oauth2/auth/loginAuth')
                                        .type('urlencoded')
                                        .send({ _csrf: csrf, username: goodUser.username, password: goodUser.password })
                                        .set('Cookie', authCookie.name + '=' + authCookie.value)
                                        .expect('Location', '/oauth2/auth/loginAuth/../requestAccess')
                                        .expect(302, done);
                                }
                            );


                        });

                });
        });

    });

    describe('/oauth2/auth/requestAccess', function () {
        it('should not allow just GET this url', function (done) {
            request(app)
                .get('/oauth2/auth/requestAccess')
                .expect(403, done);
        });

        it('should expect that user visit previous steps', function (done) {
            request(app)
                .get('/oauth2/auth?response_type=code&client_id=123&state=aaaa&redirect_uri=http://a')
                .end(function (err, res) {
                    var authCookie = new Cookie(res.headers['set-cookie'][0]);

                    request(app)
                        .get('/oauth2/auth/login')
                        .set('Cookie', authCookie.name + '=' + authCookie.value)
                        .end(function (err, res) {

                            jsdom.env(res.text, function (err, window) {
                                    var csrf = window.document.querySelectorAll('#form-signin input[name=_csrf]')[0].getAttribute('value');

                                    request(app)
                                        .post('/oauth2/auth/loginAuth')
                                        .type('urlencoded')
                                        .send({ _csrf: csrf, username: goodUser.username, password: goodUser.password })
                                        .set('Cookie', authCookie.name + '=' + authCookie.value)
                                        .end(function (err, res) {
                                            request(app)
                                                .get('/oauth2/auth/requestAccess')
                                                .set('Cookie', authCookie.name + '=' + authCookie.value)
                                                .expect('Content-Type', /html/)
                                                .expect(200)
                                                .expect(/Yes.*No/ig, function (err, res) {
                                                    if (err) return done(err);

                                                    done();
                                                })
                                        });
                                }
                            );


                        });

                });
        });

        it('should have csrf protection', function (done) {
            request(app)
                .get('/oauth2/auth?response_type=code&client_id=123&state=aaaa&redirect_uri=http://a')
                .end(function (err, res) {
                    var authCookie = new Cookie(res.headers['set-cookie'][0]);

                    request(app)
                        .get('/oauth2/auth/login')
                        .set('Cookie', authCookie.name + '=' + authCookie.value)
                        .end(function (err, res) {

                            jsdom.env(res.text, function (err, window) {
                                var csrf = window.document.querySelectorAll('#form-signin input[name=_csrf]')[0].getAttribute('value');

                                request(app)
                                    .post('/oauth2/auth/loginAuth')
                                    .type('urlencoded')
                                    .send({ _csrf: csrf, username: goodUser.username, password: goodUser.password })
                                    .set('Cookie', authCookie.name + '=' + authCookie.value)
                                    .end(function (err, res) {
                                        request(app)
                                            .get('/oauth2/auth/requestAccess')
                                            .set('Cookie', authCookie.name + '=' + authCookie.value)
                                            .end(function (err, res) {
                                                jsdom.env(res.text, function (err, window) {
                                                        var csrf = window.document.querySelectorAll('input[name=_csrf]')[0].getAttribute('value');

                                                        should.exists(csrf);
                                                        csrf.should.not.be.empty;

                                                        done();
                                                    }
                                                );

                                            });
                                    });
                            });
                        });
                });
        });

        it('should redirect with error if such client does not exist', function (done) {
            request(app)
                .get('/oauth2/auth?response_type=code&client_id=aaa&state=aaaa&redirect_uri=http://a')
                .end(function (err, res) {
                    var authCookie = new Cookie(res.headers['set-cookie'][0]);

                    request(app)
                        .get('/oauth2/auth/login')
                        .set('Cookie', authCookie.name + '=' + authCookie.value)
                        .end(function (err, res) {

                            jsdom.env(res.text, function (err, window) {
                                var csrf = window.document.querySelectorAll('#form-signin input[name=_csrf]')[0].getAttribute('value');

                                request(app)
                                    .post('/oauth2/auth/loginAuth')
                                    .type('urlencoded')
                                    .send({ _csrf: csrf, username: goodUser.username, password: goodUser.password })
                                    .set('Cookie', authCookie.name + '=' + authCookie.value)
                                    .end(function (err, res) {
                                        request(app)
                                            .get('/oauth2/auth/requestAccess')
                                            .set('Cookie', authCookie.name + '=' + authCookie.value)
                                            .expect('Location', 'http://a?error=unauthorized_client&state=aaaa')
                                            .expect(302, done);
                                    });
                            });
                        });
                });
        });
    });

    describe('/oauth2/auth/requestAccessAuth', function () {
        it('should allow only GET', function (done) {
            request(app)
                .get('/oauth2/auth/requestAccessAuth')
                .expect(404)
                .end(function () {
                    request(app)
                        .post('/oauth2/auth/requestAccessAuth')
                        .expect(403, done);
                });
        });

        it('should expect that user authorized with previous steps or that all parameters included', function (done) {
            request(app)
                .get('/oauth2/auth?response_type=code&client_id=123&state=aaaa&redirect_uri=http://a')
                .end(function (err, res) {
                    var authCookie = new Cookie(res.headers['set-cookie'][0]);

                    request(app)
                        .get('/oauth2/auth/login')
                        .set('Cookie', authCookie.name + '=' + authCookie.value)
                        .end(function (err, res) {

                            jsdom.env(res.text, function (err, window) {
                                    var csrf = window.document.querySelectorAll('#form-signin input[name=_csrf]')[0].getAttribute('value');

                                    request(app)
                                        .post('/oauth2/auth/loginAuth')
                                        .type('urlencoded')
                                        .send({ _csrf: csrf, username: goodUser.username, password: goodUser.password })
                                        .set('Cookie', authCookie.name + '=' + authCookie.value)
                                        .end(function (err, res) {
                                            request(app)
                                                .get('/oauth2/auth/requestAccess')
                                                .set('Cookie', authCookie.name + '=' + authCookie.value)
                                                .end(function (err, res) {
                                                    jsdom.env(res.text, function (err, window) {
                                                            var csrf = window.document.querySelectorAll('input[name=_csrf]')[0].getAttribute('value');

                                                            request(app)
                                                                .post('/oauth2/auth/requestAccessAuth')
                                                                .set('Cookie', authCookie.name + '=' + authCookie.value)
                                                                .type('urlencoded')
                                                                .send({ _csrf: csrf })
                                                                .expect('Location', 'http://a?error=invalid_request&state=aaaa')
                                                                .expect(302, done);
                                                        }
                                                    );
                                                })
                                        });
                                }
                            );


                        });

                });
        });

        it('should expect that user authorized with previous steps and it save state', function (done) {
            request(app)
                .get('/oauth2/auth?response_type=code&client_id=123&state=aaaa&redirect_uri=http://a')
                .end(function (err, res) {
                    var authCookie = new Cookie(res.headers['set-cookie'][0]);

                    request(app)
                        .get('/oauth2/auth/login')
                        .set('Cookie', authCookie.name + '=' + authCookie.value)
                        .end(function (err, res) {

                            jsdom.env(res.text, function (err, window) {
                                    var csrf = window.document.querySelectorAll('#form-signin input[name=_csrf]')[0].getAttribute('value');

                                    request(app)
                                        .post('/oauth2/auth/loginAuth')
                                        .type('urlencoded')
                                        .send({ _csrf: csrf, username: goodUser.username, password: goodUser.password })
                                        .set('Cookie', authCookie.name + '=' + authCookie.value)
                                        .end(function (err, res) {
                                            request(app)
                                                .get('/oauth2/auth/requestAccess')
                                                .set('Cookie', authCookie.name + '=' + authCookie.value)
                                                .end(function (err, res) {
                                                    jsdom.env(res.text, function (err, window) {
                                                            var csrf = window.document.querySelectorAll('input[name=_csrf]')[0].getAttribute('value');

                                                            request(app)
                                                                .post('/oauth2/auth/requestAccessAuth')
                                                                .set('Cookie', authCookie.name + '=' + authCookie.value)
                                                                .type('urlencoded')
                                                                .send({ _csrf: csrf, result: 'Yes' })
                                                                .expect(302, function (err, res) {
                                                                    if (err) return done(err);

                                                                    res.headers['location'].should.match(/^http:\/\/a\?code=[a-fA-F0-9]+&state=aaaa$/);

                                                                    done();
                                                                });
                                                        }
                                                    );
                                                })
                                        });
                                }
                            );


                        });

                });
        });
    });

    describe('/oauth2/token', function () {
        it('should allow only POST', function (done) {
            request(app)
                .get('/oauth2/token')
                .expect(404, function (err, res) {
                    request(app)
                        .post('/oauth2/token')
                        .expect(400, done);
                })
        });

        it('should allow to post only with all 4 body parameters and grant_type should be authorization_code', function (done) {
            request(app)
                .post('/oauth2/token')
                .type('form')
                .send({ grant_type: 'authorization_code', code: '123', client_id: '123', redirect_uri: '123'})
                .expect(401, function (err, res) {
                    if (err) return done(err);

                    done();
                });
        });

        it('should expect that user got auth code and use the not same parameters, then 401', function (done) {
            request(app)
                .get('/oauth2/auth?response_type=code&client_id=123&state=aaaa&redirect_uri=http://a')
                .end(function (err, res) {
                    var authCookie = new Cookie(res.headers['set-cookie'][0]);

                    request(app)
                        .get('/oauth2/auth/login')
                        .set('Cookie', authCookie.name + '=' + authCookie.value)
                        .end(function (err, res) {

                            jsdom.env(res.text, function (err, window) {
                                    var csrf = window.document.querySelectorAll('#form-signin input[name=_csrf]')[0].getAttribute('value');

                                    request(app)
                                        .post('/oauth2/auth/loginAuth')
                                        .type('form')
                                        .send({ _csrf: csrf, username: goodUser.username, password: goodUser.password })
                                        .set('Cookie', authCookie.name + '=' + authCookie.value)
                                        .end(function (err, res) {
                                            request(app)
                                                .get('/oauth2/auth/requestAccess')
                                                .set('Cookie', authCookie.name + '=' + authCookie.value)
                                                .end(function (err, res) {
                                                    jsdom.env(res.text, function (err, window) {
                                                            var csrf = window.document.querySelectorAll('input[name=_csrf]')[0].getAttribute('value');

                                                            request(app)
                                                                .post('/oauth2/auth/requestAccessAuth')
                                                                .set('Cookie', authCookie.name + '=' + authCookie.value)
                                                                .type('form')
                                                                .send({ _csrf: csrf, result: 'Yes' })
                                                                .expect(302, function (err, res) {
                                                                    if (err) return done(err);

                                                                    var code = url.parse(res.headers['location'], true).query.code;

                                                                    request(app)
                                                                        .post('/oauth2/token')
                                                                        .type('form')
                                                                        .send({ grant_type: 'authorization_code', code: code, client_id: '123', redirect_uri: '123'})
                                                                        .expect(401, done);

                                                                });
                                                        }
                                                    );
                                                })
                                        });
                                }
                            );


                        });

                });
        });

        it('should expect that user got auth code and use the same parameters', function (done) {
            request(app)
                .get('/oauth2/auth?response_type=code&client_id=123&state=aaaa&redirect_uri=http://a')
                .end(function (err, res) {
                    var authCookie = new Cookie(res.headers['set-cookie'][0]);

                    request(app)
                        .get('/oauth2/auth/login')
                        .set('Cookie', authCookie.name + '=' + authCookie.value)
                        .end(function (err, res) {

                            jsdom.env(res.text, function (err, window) {
                                    var csrf = window.document.querySelectorAll('#form-signin input[name=_csrf]')[0].getAttribute('value');

                                    request(app)
                                        .post('/oauth2/auth/loginAuth')
                                        .type('form')
                                        .send({ _csrf: csrf, username: goodUser.username, password: goodUser.password })
                                        .set('Cookie', authCookie.name + '=' + authCookie.value)
                                        .end(function (err, res) {
                                            request(app)
                                                .get('/oauth2/auth/requestAccess')
                                                .set('Cookie', authCookie.name + '=' + authCookie.value)
                                                .end(function (err, res) {
                                                    jsdom.env(res.text, function (err, window) {
                                                            var csrf = window.document.querySelectorAll('input[name=_csrf]')[0].getAttribute('value');

                                                            request(app)
                                                                .post('/oauth2/auth/requestAccessAuth')
                                                                .set('Cookie', authCookie.name + '=' + authCookie.value)
                                                                .type('form')
                                                                .send({ _csrf: csrf, result: 'Yes' })
                                                                .expect(302, function (err, res) {
                                                                    if (err) return done(err);

                                                                    var code = url.parse(res.headers['location'], true).query.code;

                                                                    request(app)
                                                                        .post('/oauth2/token')
                                                                        .type('form')
                                                                        .send({ grant_type: 'authorization_code', code: code, client_id: '123', redirect_uri: 'http://a'})
                                                                        .expect(200, done);

                                                                });
                                                        }
                                                    );
                                                })
                                        });
                                }
                            );


                        });

                });
        });
    });
});