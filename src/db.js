var uuid = require('node-uuid')
    , config = require('./config.js');

var entries = {};

function isQueueClosed(entry) {
    return (entry.queue.length > 0 && entry.queue[entry.queue.length - 1] === null) ? true : false;
}

function setInactivityTimeout(entry) {
    if (entry.timeout) {
        clearTimeout(entry.timeout);
    }

    entry.timeout = setTimeout(function () {
        config.logger.verbose('Removing inactive relay entry', 
            { id: entry.id, queueLength: entry.queue.length, queueClosed: isQueueClosed(entry) });

        // entry expired - terminate any active polls

        if (entry.pendingRequests) {
            for (var i in entry.pendingRequests) {
                var pendingRequest = entry.pendingRequests[i];
                clearTimeout(pendingRequest.timeout);
                pendingRequest.callback({ code: 410 })
            }
        }

        delete entries[entry.id];
    }, entry.params.ttl);    
}

exports.create = function (params, ttl, callback) {
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

    defaultParams.ttl = ttl;

    var id = uuid.v4().replace(/-/g, '');
    var entry = {
        id: id,
        params: defaultParams,
        queue: []
    };

    config.logger.verbose('Creating new relay entry', entry);

    setInactivityTimeout(entry);

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
    else if (isQueueClosed(entry)) {
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
    else if (isQueueClosed(entry)) {
        // cannot add element because the queue is already closed

        callback({ code: 400 });
    }
    else {
        // add message to queue 
        var from = entry.queue.length;
        entry.queue.push(body);

        // reset inactivity timeout
        setInactivityTimeout(entry);

        if (entry.queue.length == entry.params.maxQueueLength && body !== null) {
            // add sentinel value to the queue indicating the queue is closed
            entry.queue.push(null);
        }

        config.logger.verbose('Posted relay message', 
            { id: id, queueLength: entry.queue.length, queueClosed: isQueueClosed(entry) });

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