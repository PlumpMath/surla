// polyfill Buffer.concat
if (!Buffer.concat) {
  Buffer.concat = function (buffers) {
    var size = 0;
    buffers.forEach(function (buffer) { size += buffer.length; });
    var result = new Buffer(size);
    var size = 0;
    buffers.forEach(function (buffer) {
      buffer.copy(result, size);
      size += buffer.length;
    });

    return result;
  }
}

exports.bodyBuffer = function (bufferContent) {
  return function(req, res, next) {
    if (req._body) {
      // body was parsed by prior middleware
      return next();
    }
    else if (bufferContent) {
      req._body = true;
      var body = [];
      req.on('data', function (data) {
        body.push(data);
      });
      req.on('end', function () {
        req.body = body.length == 0 ? null : Buffer.concat(body);
        next();
      });
    }
    else {
      req._body = true;
      req.body = req;
      next();
    }
  }
};