/*
Relay security:

- Each relay user has key K
- relay:create requires K; may indicate (true, false) for relay:post and relay:poll security; the server 
  will generate Kpost and Kpoll accordingly and store in relay entry parameters
- relay:post requires Kpost if requested at relay:create, or is open to anyone with knowledge of relay ID
- relay:poll requires Kpoll if requested at relay:create, or is open to anyone with knowledge of relay ID
- relay:get requires K of the creator of the relay entry or provider of the interaction
*/

var db = require('../src/db.js')
    , config = require('../src/config.js');

exports.authorizeCreate = function(req, callback) {
    if (typeof req.body !== 'object') {
        return callback({ code: 400, message: 'JSON object required in the request' })
    }

    db.getAccount(req.body.accountId, function (error, account) {
        if (error) {
            return callback(error);
        }

        if (account.keys.some(function (key) { return key === req.body.key; })) {
            return callback();
        }
        else {
            config.logger.warn('Authorization of relay create failed ', { accountId: req.body.accountId });
            return callback({ code: 401, message: 'Not authorized' });
        }
    });
};

var relayAuthenticators = {
    poll: function (entry, key) {
        return entry.params.pollKey === undefined 
            || entry.params.pollKey === key;
    },
    post: function (entry, key) {
        return entry.params.postKey === undefined 
            || entry.params.postKey === key;
    },
    get: function (entry, key) {
        return entry.params.key === key;    
    }
};

exports.createRelaySecurity = function (operation) {
    return function (req, res, next) {
        db.get(req.params.id, function (error, entry) {
            if (error) {
                res.send(error.code, error.message || '');
            }
            else if (relayAuthenticators[operation](entry, req.query.key)) {
                req.entry = entry;
                next(); // access allowed
            }
            else {
                config.logger.warn('Relay authorization failed', { id: req.params.id, operation: operation, key: req.query.key });
                res.send(401, 'Not authorized');
            }
        });
    };
};
