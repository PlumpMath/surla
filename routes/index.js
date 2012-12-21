exports.index = function(req, res) {
    res.render('index');
};

exports.noun = function (req, res) {
    res.render('noun');
};

exports.upload = function (req, res) {
    res.render('upload');
};

exports.sniffer = function (req, res) {
    res.render('sniffer');
};

exports.options = function (req, res) {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.set('Access-Control-Allow-Headers', req.get('Access-Control-Request-Headers') || '*');
    res.send(200, '');
}