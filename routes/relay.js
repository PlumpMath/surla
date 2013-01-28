var db = require('../src/db.js')
    , config = require('../src/config.js')
    , security = require('./security.js')
    , uuid = require('node-uuid');

function createKey() {
    return uuid.v4().replace(/-/g, '');
}

exports.addCommonResponseHeaders = function (req, res, next) {
    res.set('Cache-Control', 'no-cache');
    res.set('Access-Control-Allow-Origin', '*');
    next();
};

exports.create = function(req, res) {
    security.authorizeCreate(req, function (error) {
        if (error) {
            return res.send(error.code, error.message || '');
        }

        if (!req.body.disablePollAuth) {
            req.body.pollKey = req.body.pollKey || createKey();
        }
        
        if (!req.body.disablePostAuth) {
            req.body.postKey = req.body.postKey || createKey();
        }

        db.create(req.body, config.inactiveRelayEntryTTL, function (error, entry) {
            if (error) {
                res.send(error.code, error.message || '');
            }
            else {
                var response = { id: entry.id };
                if (entry.params.pollKey) {
                    response.pollKey = entry.params.pollKey;
                }

                if (entry.params.postKey) {
                    response.postKey = entry.params.postKey;
                }

                res.json(201, response);
            }
        });
    });
};

exports.poll = function(req, res) {
    req.params.from = req.params.from || 0;
    db.poll(req.params.id, req.params.from, config.relayPollTimeout, function (error, response) {
        try {
            if (error) {
                error.id = req.params.id;
                error.from = req.params.from;
                config.logger.verbose('Failed relay poll', error);
                res.send(error.code, error.message || '');
            }
            else {
                config.logger.verbose('Releasing relay poll', 
                    { id: req.params.id, from: req.params.from, messages: response.length });
                res.json(200, response);
            }            
        }
        catch (e) {
            config.logger.error('Error sending relay poll response', { id: req.params.id, from: req.params.from, error: e });
        }
    });
};

exports.getAttachment = function(req, res) {
    db.getAttachment(req.params.id, req.params.position, function (error, attachment) {
        try {
            if (error) {
                error.id = req.params.id;
                error.position = req.params.position;
                config.logger.verbose('Error getting attachment', error);
                res.send(error.code, error.message || '');
            }
            else {
                config.logger.verbose('Returning attachment', 
                    { id: req.params.id, position: req.params.position, contentType: attachment.contentType,
                      length: attachment.body.length });
                res.set('Content-Type', attachment.contentType);
                res.set('Content-Length', attachment.body.length);
                res.send(200, attachment.body);
            }            
        }
        catch (e) {
            config.logger.error('Error returning attachment', { id: req.params.id, position: req.params.position, error: e });
        }
    });
};

exports.post = function (req, res) {
    var body = req.get('Content-Length') == 0 ? null : req.body;
    db.post(req.params.id, req.get('Content-Type'), body, function (error) {
        try {
            if (error) {
                error.id = req.params.id;
                config.logger.verbose('Failed relay post', error);
                res.send(error.code, error.message || '');
            }
            else {
                res.json(201);
            }            
        }
        catch (e) {
            config.logger.error('Error posting to relay', { id: req.params.id, error: e });
        }        
    });
}

exports.stats = function (req, res) {
    // req.entry was created in security.createRelaySecurity
    var result = {
        id: req.entry.id,
        created: req.entry.created,
        params: req.entry.params,
        pendingRequests: req.entry.pendingRequests ? Object.getOwnPropertyNames(req.entry.pendingRequests).length : 0,
        queueLength: req.entry.queue.length,
        attachments: Object.getOwnPropertyNames(req.entry.attachments),
    };

    res.json(result);
};
