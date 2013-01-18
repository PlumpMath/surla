var db = require('../src/db.js')
    , config = require('../src/config.js')
    , fs = require('fs')
    , authentication = require('./authentication.js')
    , payment = require('./payment.js');

exports.get = function(req, res) {
    db.get(req.params.id, function (error, entry) {
        if (error) {
            res.send(error.code, error.message || '');
        }
        else if (!entry.params.interaction) {
            res.send(404, 'There is no view associated with this resource');
        }
        else {
            var func = exports.get['_' + entry.params.interaction.type];
            if (!func) {
                throw new Error('Unsupported interaction type: ' + entry.params.interaction.type);
            }

            config.logger.verbose('Start interaction', { type: entry.params.interaction.type, id: req.params.id });

            return func(entry, req, res);
        }
    });
};

exports.get._Chat = function (entry, req, res) {
    res.render('interactions/chat', { relayUrl: config.relayBaseUri + req.params.id });
};

exports.get._FileUpload = function (entry, req, res) {
    db.post(req.params.id, 'application/json', { 'hello': true }, function (error) {
        if (error) {
            config.logger.error('Unable to post hello message', { type: entry.params.interaction.type, id: req.params.id, error: error });
            res.send(500);
        }
        else {
            res.render('interactions/upload', { entry: entry, id: req.params.id });
        }
    });
};

exports.get._Sniffer = function (entry, req, res) {
    db.post(req.params.id, 'application/json', [ { headers: req.headers || {} }, null ], function (error) {
        if (error) {
            res.send(error.code, error.message || '');
        }
        else {
            res.render('interactions/thankyou');
        }
    });
};

exports.get._Remote = function (entry, req, res) {
    var relayUrl = config.relayBaseUri + req.params.id;
    res.render('interactions/remote', { 
        relayUrl: relayUrl, 
        holdEvents: entry.params.interaction.holdEvents || false,
        cacheInterval: (typeof entry.params.interaction.cacheInterval === 'undefined' ? 500 : entry.params.interaction.cacheInterval)
    });
}

exports.get._Login = function (entry, req, res) {
    var relayUrl = config.relayBaseUri + req.params.id;
    var model = {};
    if (!entry.params.interaction.providers) {
        model.enableTwitter = true;
        model.enableFacebook = true;
    }
    else {
        model.enableTwitter = entry.params.interaction.providers.some(function (item) { return item === 'Twitter'; });
        model.enableFacebook = entry.params.interaction.providers.some(function (item) { return item === 'Facebook'; });
    }

    db.post(req.params.id, 'application/json', { 'hello': true }, function (error) {
        if (error) {
            config.logger.error('Unable to post hello message', { type: entry.params.interaction.type, id: req.params.id, error: error });
            res.send(500);
        }
        else {
            res.render('interactions/login', model);
        }
    });    
}

exports.get._Payment = function (entry, req, res) {
    var model = {
        enableCarrier: typeof entry.params.interaction.methods.carrier != 'undefined',
        enableAmazon: typeof entry.params.interaction.methods.amazon != 'undefined',
        enablePaypal: typeof entry.params.interaction.methods.paypal != 'undefined',
        enableCard: typeof entry.params.interaction.methods.card != 'undefined',
        amount: entry.params.interaction.amount,
        currency: entry.params.interaction.currency,
        description: entry.params.interaction.description,
        orderof: entry.params.interaction.orderof
    };

    db.post(req.params.id, 'application/json', { 'hello': true }, function (error) {
        if (error) {
            config.logger.error('Unable to post hello message', { type: entry.params.interaction.type, id: req.params.id, error: error });
            res.send(500);
        }
        else {
            res.render('interactions/payment', model);
        }
    });    
}

exports.post = function(req, res) {
    db.get(req.params.id, function (error, entry) {
        if (error) {
            res.send(error.code, error.message || '');
        }
        else if (!entry.params.interaction) {
            res.send(404, 'There is no view associated with this resource');
        }
        else {            
            var func = exports.post['_' + entry.params.interaction.type];
            return func(entry, req, res);
        }
    });
};

exports.post._Login = function (entry, req, res) {
    if (!req.body.provider) {
        res.send(400, 'Login provider not specified');
    }
    else {
        config.logger.verbose('Received postback from Login view', 
            { id: req.params.id, provider: req.body.provider });

        var func = authentication['post' + req.body.provider];
        if (func) {
            func(entry, req, res);
        }
        else {
            res.send(400, 'Login provider not supported');
        }
    }    
}

var paymentViewModel = {
    'Paypal': 'Paypal',
    'Amazon': 'Amazon',
    'Credit/Debit Card': 'Card',
    'Phone Bill': 'Carrier'
};

exports.post._Payment = function (entry, req, res) {
    if (req.body.pretend) {
        payment.finish(req.params.id, res, 'thankyou', {
            success: true,
            method: req.body.method
        });
    }
    else if (!req.body.method) {
        res.send(400, 'Payment method not specified');
    }
    else if (paymentViewModel[req.body.method]) {
        config.logger.verbose('Received postback from Payment view', 
            { id: req.params.id, method: req.body.method });

        var func = payment['post' + paymentViewModel[req.body.method]];
        if (func) {
            func(entry, req, res);
        }
        else {
            res.render('interactions/paymentnotsupported', { method: paymentViewModel[req.body.method] });
        }
    }    
}

exports.post._FileUpload = function (entry, req, res) {
    if (!req.files.upfile) {
        res.send(400, 'Upload file not submitted');
    }
    else {
        config.logger.verbose('Received postback from FileUpload view', 
            { id: req.params.id, size: req.files.upfile.size, type: req.files.upfile.type, name: req.files.upfile.name });

        if (req.files.upfile.size === 0) {
            res.render('interactions/upload', { entry: entry, id: req.params.id });
        }
        else {
            fs.readFile(req.files.upfile.path, function (error, data) {
                if (error) {
                    config.logger.error('Error reading uploaded file', { id: req.params.id, path: req.files.upfile.path });
                    res.send(500, 'Error processing uploaded file');
                }
                else {
                    db.post(req.params.id, req.files.upfile.type, data, function (error) {
                        if (error) {
                            res.send(error.code, error.message || '');
                        }
                        else {
                            db.post(req.params.id, 'application/json', null, function (error) {
                                if (error) {
                                    res.send(error.code, error.message || '');
                                }
                                else {
                                    res.render('interactions/thankyou');
                                }
                            });
                        }
                    });
                }
            });
        }        
    }    
}

