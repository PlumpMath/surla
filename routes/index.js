var http = require('http')
    , config = require('../src/config.js');


exports.index = function(req, res) {
    res.render('index');
};

exports.noun = function (req, res) {
    res.render('noun');
};

exports.upload = function (req, res) {
    res.render('samples/upload');
};

exports.sniffer = function (req, res) {
    res.render('samples/sniffer');
};

exports.remote = function (req, res) {
    res.render('samples/remote');
};

exports.login = function (req, res) {
    res.render('samples/login');
};

exports.payment = function (req, res) {
    var payment = {
      maxQueueLength: 2,
      interaction: {
        type: 'Payment',
        amount: '5.00',
        currency: 'USD',
        description: 'Introduction to node.js on Windows',
        orderof: 'Origami Movies', 
        methods: {
          carrier: {},
          amazon: {},
          paypal: {},
          card: {}
        }
      }
    };

    var options = {
      hostname: 'surla.mobi',
      port: 80,
      path: '/r',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    };

    var relayReq = http.request(options, function(relayRes) {
        if (relayRes.statusCode !== 201) {
            config.logger.error('Unable to create relay entry to render payment view', { httpStatus: relayRes.statusCode });
            res.send(500, 'Unable to create relay entry to support the payment');
        }
        else {
            relayRes.setEncoding('utf8');
            var body = '';
            relayRes.on('data', function (chunk) { body += chunk; });
            relayRes.on('end', function () {
                var relayEntry;
                try {
                    relayEntry = JSON.parse(body);
                }
                catch (e) {
                    config.logger.error('Unable to create relay entry to render payment view', e);
                    return res.send(500, 'Unable to create relay entry to support the payment');
                }

                res.render('samples/payment', relayEntry);
            });
        }
    });

    relayReq.on('error', function(e) {
        config.logger.error('Unable to create relay entry to render payment view', e);
        res.send(500, 'Unable to create relay entry to support the payment');
    });

    relayReq.end(JSON.stringify(payment));    
}

exports.options = function (req, res) {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.set('Access-Control-Allow-Headers', req.get('Access-Control-Request-Headers') || '*');
    res.send(200, '');
}