var db = require('../src/db.js')
    , config = require('../src/config.js')
    , fs = require('fs');

exports.get = function(req, res) {
    db.get(req.params.id, function (error, entry) {
        if (error) {
            res.send(error.code, error.message || '');
        }
        else if (!entry.params.interaction) {
            res.send(404, 'There is no view associated with this resource');
        }
        else {
            config.logger.verbose('Rendering view', { type: entry.params.interaction.type, id: req.params.id });
            res.render(entry.params.interaction.type, { entry: entry, id: req.params.id });
        }
    });
};

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

exports.post._FileUpload = function postFileUpload(entry, req, res) {
    if (!req.files.upfile) {
        res.send(400, 'Upload file not submitted');
    }
    else {
        config.logger.verbose('Received postback from FileUpload view', 
            { id: req.params.id, size: req.files.upfile.size, type: req.files.upfile.type, name: req.files.upfile.name });

        if (req.files.upfile.size === 0) {
            res.render('FileUpload', { entry: entry, id: req.params.id });
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
                            res.render('thankyou');
                        }
                    });
                }
            });
        }        
    }    
}

