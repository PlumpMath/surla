var uuid = require('node-uuid')
    , config = require('./config.js');

var entries = {};

exports.create = function (params, callback) {
    if (typeof params !== 'object') {
        return callback({ code: 400, message: 'Request parameters must be specified as a JSON object' });
    }

    var defaultParams = {
        maxQueueLength: 1
    };

    for (var i in params) {
        if (typeof defaultParams[i] === 'undefined') {
            return callback({ code: 400, message: 'Unsupported parameter ' + i });
        }

        defaultParams[i] = params[i];
    }

    var id = uuid.v4().replace(/-/g, '');
    var entry = {
        id: id,
        params: defaultParams,
        queue: []
    };

    config.logger.verbose('Creating new relay entry', entry);

    entries[id] = entry;

    callback(null, entry);
};

exports.poll = function (id, from, timeout, callback) {
    var entry = entries[id];

    if (!entry) {
        // id not found

        callback({ code: 404 });
    }
    else if (entry.queue.length > from) {
        // data ready to return

        callback(null, entry.queue.slice(from))
    }
    else if (entry.queue.length > 0 && entry.queue[entry.queue.length - 1] === null) {
        // request out of range: response queue is already closed 
        // while `from` points to an index beyond the last element in the queue

        callback({ code: 416 });
    }
    else if (entry.queue.length != from) {
        // unsupported request for element other the next element to be enqued

        callback({ code: 400 });
    }
    else {
        // park the request and wait for the next element to be enqueued or for poll timeout

        config.logger.verbose('Parking relay request', { id:  id, from: from });

        var pendingRequestId = uuid.v4();
        entry.pendingRequests = entry.pendingRequests || {};
        entry.pendingRequests[pendingRequestId] = {
            callback: callback,
            timeout: setTimeout(function () {
                delete entry.pendingRequests[pendingRequestId];
                callback(null, []);
            }, timeout)
        };
    }
};

exports.post = function (id, body, callback) {
    var entry = entries[id];

    if (!entry) {
        // id not found

        callback({ code: 404 });
    }
    else if (entry.queue.length > 0 && entry.queue[entry.queue.length - 1] === null) {
        // cannot add element because the queue is already closed

        callback({ code: 400 });
    }
    else {
        // add message to queue 
        var from = entry.queue.length;
        entry.queue.push(body);

        if (entry.queue.length == entry.params.maxQueueLength && body !== null) {
            // add sentinel value to the queue indicating the queue is closed
            entry.queue.push(null);
        }

        config.logger.verbose('Posted relay message', 
            { id: id, queueLength: entry.queue.length, queueClosed: (entry.queue[entry.queue.length - 1] === null) });

        if (entry.pendingRequests) {
            // release pending requests
            var pendingRequests = entry.pendingRequests;
            delete entry.pendingRequests;
            var response = entry.queue.slice(from);
            for (var i in pendingRequests) {
                var pendingRequest = pendingRequests[i];
                clearTimeout(pendingRequest.timeout);
                pendingRequest.callback(null, response);
            }
        }

        callback();
    }

};