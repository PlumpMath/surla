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

exports.bodyBuffer = function () {
  return function(req, res, next) {
    if (req._body) {
      // body was parsed by prior middleware
      return next();
    }

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
};