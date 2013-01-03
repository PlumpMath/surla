var db = require('../src/db.js')
    , config = require('../src/config.js')
    , https = require('https')
    , url = require('url')
    , OAuth = require('oauth').OAuth
    , crypto = require('crypto');

exports.postFacebook = function (entry, req, res) {
    // start Facebook login flow

    var facebookUri = 'https://www.facebook.com/dialog/oauth' +
        '?client_id=' + encodeURIComponent(config.facebookAppId) +
        '&redirect_uri=' + encodeURIComponent(config.loginBaseUri + 'facebook?surla_id=' + req.params.id);

    res.redirect(facebookUri);
};

exports.getFacebook = function (req, res) {
    if (!req.query.surla_id) {
        config.logger.error('Redirect from Facebook login lacks surla_id parameter', req.query);
        return res.render(400, 'Invalid response from Facebook');
    }

    db.get(req.query.surla_id, function (error, entry) {
        if (error) {
            return res.render('loginfailed');
        }

        if (req.query.error) {
            config.logger.verbose('Redirect from Facebook login with error', req.query);
            finish(req, res, 'loginfailed', { 
                provider:'Facebook', 
                success: false, 
                error: req.query.error, 
                error_description: req.query.error_description 
            });
        }
        else if (req.query.code) {
            var facebookUri = '/oauth/access_token' +
                    '?client_id=' + encodeURIComponent(config.facebookAppId) +
                    '&client_secret=' + encodeURIComponent(config.facebookAppSecret) +
                    '&code=' + encodeURIComponent(req.query.code) +
                    '&redirect_uri=' + encodeURIComponent(config.loginBaseUri + 'facebook?surla_id=' + req.query.surla_id);
            var options = {
                host: 'graph.facebook.com',
                port: 443,
                path: facebookUri,
                method: 'GET'
            };

            config.logger.verbose('Redirect from Facebook login with code, exchanging for access token', 
                { id: req.query.surla_id });

            makeHttpsRequest(options, null, function (error, res2, body) {
                if (error) {
                    config.logger.verbose('Error exchanging Facebook code for access token', { id: req.query.surla_id, error: error });
                    finish(req, res, 'loginfailed', { 
                        provider:'Facebook', 
                        success: false, 
                        error: 'Unable to exchange OAuth code for OAuth access token' 
                    });
                }
                else if (res2.statusCode !== 200) {
                    config.logger.verbose('Error exchanging Facebook code for access token', { id: req.query.surla_id, code: res2.statusCode });
                    finish(req, res, 'loginfailed', { 
                        provider:'Facebook', 
                        success: false, 
                        error: 'The Facebook graph API failed with HTTP response ' + res.statusCode
                    });
                }
                else {
                    config.logger.verbose('Success obtaining Facebook access token', { id: req.query.surla_id });
                    finish(req, res, 'thankyou', { 
                        provider: 'Facebook',
                        success: true, 
                        data: url.parse('?' + body, true).query
                    });
                }
            });

        }
        else {
            finish(req, res, 'loginfailed', { 
                provider: 'Facebook',
                success: false, 
                error: 'Invalid response from Facebook' 
            });
        }        
    });
};

function finish(req, res, view, message) {
    db.post(req.query.surla_id, 'application/json', message, function (error) {
        if (error) {
            config.logger.error('Unable to post ' + message.provider + ' login result to relay', 
                { id: req.query.surla_id, error: error });
            res.render('loginfailed');
        }
        else {
            res.render(view);
        }
    });
}

function makeHttpsRequest(options, body, callback) {
    var req = https.request(options, function (res) {
        var body = '';
        res.on('data', function (data) { body += data; });
        res.on('end', function () {
            callback(null, res, body);
        });
    });

    req.on('error', callback);

    if (body) {
        req.write(body);
    }

    req.end();
}

function getTwitterOAuthInstance(id) {
    return new OAuth(
        'https://api.twitter.com/oauth/request_token',
        'https://api.twitter.com/oauth/access_token',
        config.twitterConsumerKey,
        config.twitterConsumerSecret,
        '1.0',
        config.loginBaseUri + 'twitter?surla_id=' + id,
        'HMAC-SHA1');
}

exports.postTwitter = function (entry, req, res) {
    // start Twitter login flow

    var oauth = getTwitterOAuthInstance(req.params.id);

    oauth.getOAuthRequestToken(function (error, requestToken, requestTokenSecret, results) {

        if (error) {
            config.logger.error('Unable to obtain OAuth request token from Twitter', { id: req.params.id, error: error });
            return finish(req, res, 'loginfailed', {
                provider: 'Twitter',
                success: false,
                error: 'Unable to obtain OAuth request token from Twitter'
            });
        }

        config.logger.verbose('Obtained OAuth request token from Twitter', { id: req.params.id });

        // Encode request token and request token secret into an encrypted cookie
        // to continue authentication flow on redirect back from Twitter

        var cipher = crypto.createCipher('aes-256-cbc', config.twitterConsumerSecret);
        res.cookie('smtw', cipher.update(JSON.stringify({ 
            rt: requestToken, 
            rts: requestTokenSecret 
        }), 'utf8', 'base64') + cipher.final('base64'));

        var twitterUri = 'https://api.twitter.com/oauth/authenticate' +
            '?oauth_token=' + encodeURIComponent(requestToken);

        res.redirect(twitterUri);
    });
};

exports.getTwitter = function (req, res) {
    res.clearCookie('smtw');

    if (!req.query.surla_id) {
        config.logger.error('Redirect from Twitter login lacks surla_id parameter', req.query);
        return res.render(400, 'Invalid response from Twitter');
    }

    if (!req.cookies.smtw) {
        config.logger.error('Redirect from Twitter login lacks smtw cookie', { id: req.query.surla_id });
        return res.render(400, 'Invalid response from Twitter');
    }

    var requestToken;
    try {
        var cipher = crypto.createDecipher('aes-256-cbc', config.twitterConsumerSecret);
        var cookieText = cipher.update(req.cookies.smtw, 'base64', 'utf8') + cipher.final('utf8');
        requestToken = JSON.parse(cookieText);
    }
    catch (err) {
        config.logger.error('Redirect from Twitter login contains invalid smtw cookie', { id: req.query.surla_id });
        return res.render(400, 'Invalid response from Twitter');
    }    

    db.get(req.query.surla_id, function (error, entry) {
        if (error) {
            config.logger.error('Redirect from Twitter login contains invalid or expired surla_id cookie', 
                { id: req.query.surla_id, smtw: req.cookies.smtw });
            return res.render('loginfailed');
        }

        if (!req.query.oauth_verifier) {
            config.logger.verbose('Twitter authentication failed', { id: req.query.surla_id, query: req.query });
            return finish(req, res, 'loginfailed', {
                provider: 'Twitter',
                success: false,
                error: 'Twitter authentication failed'
            });
        }

        var oauth = getTwitterOAuthInstance(req.query.surla_id);

        oauth.getOAuthAccessToken(requestToken.rt, requestToken.rts, req.query.oauth_verifier,
            function (error, accessToken, accessTokenSecret, results) {
            var providerToken = null;

            if (error) {
                config.logger.error('Unable to obtain OAuth access token from Twitter', 
                    { id: req.query.surla_id, error: error });
                return finish(req, res, 'loginfailed', {
                    provider: 'Twitter',
                    success: false,
                    error: 'Twitter authentication failed'
                });                
            }

            config.logger.verbose('Success obtaining Twitter access token', { id: req.query.surla_id });

            oauth.get(
                'https://api.twitter.com/1.1/users/show.json?screen_name=' + encodeURIComponent(results.screen_name),
                accessToken, 
                accessTokenSecret,
                function (error, data, response) {
                    if (error) {
                        config.logger.error('Unable to obtain Twitter profile', 
                            { id: req.query.surla_id, error: error });
                        return finish(req, res, 'loginfailed', {
                            provider: 'Twitter',
                            success: false,
                            error: 'Twitter authentication failed'
                        });                
                    }

                    var profile;
                    try {
                        profile = JSON.parse(data);
                    }
                    catch (e) {
                        config.logger.error('Unable to parse Twitter profile response', 
                            { id: req.query.surla_id, error: e });
                        return finish(req, res, 'loginfailed', {
                            provider: 'Twitter',
                            success: false,
                            error: 'Twitter authentication failed'
                        });                        
                    }

                    config.logger.verbose('Success obtaining Twitter profile', { id: req.query.surla_id });

                    finish(req, res, 'thankyou', {
                        provider: 'Twitter',
                        success: true,
                        data: {
                            access_token: accessToken,
                            access_token_secret: accessTokenSecret,
                            user_id: results.user_id,
                            screen_name: results.screen_name,
                            profile: profile
                        }
                    });
                }
            );
        });        
    });
};
