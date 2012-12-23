var db = require('../src/db.js')
    , config = require('../src/config.js')
    , https = require('https')
    , url = require('url');

exports.postFacebook = function (entry, req, res) {
    // start Facebook login flow

    var facebookUri = 'https://www.facebook.com/dialog/oauth' +
        '?client_id=' + encodeURIComponent(config.facebookAppId) +
        '&redirect_uri=' + encodeURIComponent(config.loginBaseUri + 'facebook?surla_id=' + req.params.id) + 
        '&display=popup';    

    res.redirect(facebookUri);
};

exports.getFacebook = function (req, res) {
    if (!req.query.surla_id) {
        return res.render(400, 'Invalid response from Facebook');
    }

    db.get(req.query.surla_id, function (error, entry) {
        if (error) {
            return res.render('loginfailed');
        }

        if (req.query.error) {
            finish('loginfailed', { success: false, error: req.query.error, error_description: req.query.error_description });
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

            makeHttpsRequest(options, null, function (error, res, body) {
                if (error) {
                    finish('loginfailed', { success: false, error: 'Unable to exchange OAuth code for OAuth access token' });
                }
                else if (res.statusCode !== 200) {
                    finish('loginfailed', { success: false, error: 'The Facebook graph API failed with HTTP response ' + res.statusCode });
                }
                else {
                    finish('thankyou', { 
                        success: true, 
                        data: url.parse('?' + body, true).query
                    });
                }
            });

        }
        else {
            finish('loginfailed', { success: false, error: 'Invalid response from Facebook' });
        }        

        function finish(view, message) {
            message.provider = 'Facebook';
            db.post(req.query.surla_id, 'application/json', message, function (error) {
                if (error) {
                    res.render('loginfailed');
                }
                else {
                    res.render(view);
                }
            });
        }
    });

    if (req.query.code && req.query.surla_id) {
    }
    else {
        res.send(400, 'Invalid response from Facebook');
    }
};

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
