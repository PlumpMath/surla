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
    res.render('samples/payment');
}

exports.options = function (req, res) {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.set('Access-Control-Allow-Headers', req.get('Access-Control-Request-Headers') || '*');
    res.send(200, '');
}