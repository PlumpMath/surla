var uuid = require('node-uuid')
    , config = require('./config.js')
    , azure = require('azure');

var entries = {};
var blobService = azure.createBlobService();

if (config.seedRelayEntries) {
    config.seedRelayEntries.forEach(function (entry) {
        entries[entry.id] = entry;
        entries[entry.id].created = new Date().toString();
    });
}

if (config.useAzureBlobStorage) {
    // clean up expired azure blobs
    blobService.listBlobs(config.azureBlobContainerName, function (error, blobs) {
        if (error) {
            config.logger.error('Unable to list Azure Blobs', { error: error });
        }
        else {
            var now = new Date();
            blobs.forEach(function (blob) {
                var lastModified = new Date(blob.properties['Last-Modified']);
                if ((now - lastModified) > config.azureBlobTTL) {
                    blobService.deleteBlob(config.azureBlobContainerName, blob.name, function (error) {
                        if (error) {
                            config.logger.error('Unable to delete expired Azure Blob', 
                                { name: blob.name, lastModified: blob.properties['Last-Modified'], error: error })
                        }
                        else {
                            config.logger.verbose('Deleted expired Azure Blob', 
                                { name: blob.name, lastModified: blob.properties['Last-Modified'] })
                        }
                    });
                }
            })
        }
    });
}

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

        if (entry.azureBlobs) {
            // remove any attachments associated with this relay entry
            entry.azureBlobs.forEach(function (blobName) {
                azure.deleteBlob(config.azureBlobContainerName, blobName, function (error) {
                    if (error) {
                        config.logger.error('Error deleting Azure Blob', { name: blobName, error: error });
                    }
                    else {
                        config.logger.silly('Deleted Azure Blob', { name: blobName });
                    }
                });
            });
        }

        delete entries[entry.id];
    }, entry.params.ttl);    
}

exports.create = function (params, ttl, callback) {
    if (typeof params !== 'object') {
        return callback({ code: 400, message: 'Request parameters must be specified as a JSON object' });
    }

    var defaultParams = {
        useDataUri: false,
        interaction: null,
        accountId: null,
        key: null,
        disablePollAuth: null,
        disablePostAuth: null,
        pollKey: null,
        postKey: null
    };

    for (var i in params) {
        if (typeof defaultParams[i] === 'undefined') {
            return callback({ code: 400, message: 'Unsupported parameter ' + i });
        }

        defaultParams[i] = params[i];
    }

    for (var i in defaultParams) {
        if (defaultParams[i] === null) {
            delete defaultParams[i];
        }
    }

    defaultParams.ttl = ttl;

    var id = uuid.v4().replace(/-/g, '');
    var entry = {
        id: id,
        created: new Date().toString(),
        params: defaultParams,
        queue: [],
        attachments: {}
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

        callback({ code: 404, message: 'Entry does not exist' });
    }
    else if (entry.queue.length > from) {
        // data ready to return

        // reset inactivity timeout
        setInactivityTimeout(entry);        

        callback(null, entry.queue.slice(from))
    }
    else if (isQueueClosed(entry)) {
        // request out of range: response queue is already closed 
        // while `from` points to an index beyond the last element in the queue

        // reset inactivity timeout
        setInactivityTimeout(entry);        

        callback({ code: 416, message: 'Response queue is already closed' });
    }
    else if (entry.queue.length != from) {
        // unsupported request for element other the next element to be enqued

        callback({ code: 400, message: 'Cannot poll the queue beyond the next element to be added' });
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

        // reset inactivity timeout
        setInactivityTimeout(entry);        
    }
};

exports.get = function (id, callback) {
    var entry = entries[id];

    if (!entry) {
        callback({ code: 404, message: 'Entry does not exist' });
    }
    else {
        // reset inactivity timeout
        setInactivityTimeout(entry);

        callback(null, entry);
    }
};

exports.getAttachment = function (id, position, callback) {
    var entry = entries[id];

    if (!entry) {
        // id not found

        callback({ code: 404, message: 'Queue not found' });
    }
    else if (!entry.attachments[position]) {
        // attachment not found

        callback({ code: 404, message: 'Attachment not found' });
    }
    else {
        // return the attachment

        // reset inactivity timeout
        setInactivityTimeout(entry);

        callback(null, entry.attachments[position]);
    }
};

exports.post = function (id, contentType, body, length, callback) {
    var entry = entries[id];

    if (!entry) {
        // id not found

        callback({ code: 404 });
    }
    else if (isQueueClosed(entry)) {
        // cannot add element because the queue is already closed

        callback({ code: 400, message: 'Queue is closed' });
    }
    else {
        // add message to queue 
        var from = entry.queue.length;

        if (body === null || contentType.match(/^application\/json/) || Array.isArray(body)) {
            // add JSON content directly to the queue
            if (Buffer.isBuffer(body)) {
                body = body.toString('utf8');
            }

            config.logger.silly('Posting application/json message', { id: id, message: body });
            if (Array.isArray(body)) {
                body.forEach(function (item) { 
                    entry.queue.push(item);
                });
            }
            else {
                entry.queue.push(body);
            }

            finishPost();
        }
        // else if (entry.params.useDataUri) {
        //     // add non-JSON content to the queue as data URI
        //     // http://en.wikipedia.org/wiki/Data_URI_scheme

        //     if (Buffer.isBuffer(body)) {
        //         var uri = 'data:' + contentType + ';base64,' + body.toString('base64');
        //         config.logger.silly('Posting ' + contentType + ' message as data URI', { id: id, length: body.length });
        //         entry.queue.push({ uri: uri });
        //     }
        //     else {
        //         return callback({ code: 400, message: 'Unsupported type of content'});
        //     }
        // }
        else if (config.useAzureBlobStorage) {
            var blobName = id + '/' + uuid.v4().replace(/-/g, '');
            blobService.createBlockBlobFromStream(
                config.azureBlobContainerName, 
                blobName, 
                body, 
                length,
                {
                    contentType: contentType
                },
                function (error, blob, response) {
                    console.log(blob);
                    if (error) {
                        config.logger.error('Error uploading to Azure Blob Storage', 
                            { id: id, contentType: contentType, length: length, error: error });
                        return callback({ code: 500, message: 'Failure posting content to Azure Blob Storage' });
                    }

                    var message = { 
                        contentType: contentType,
                        uri: 'http://' + process.env.AZURE_STORAGE_ACCOUNT + '.blob.core.windows.net/' 
                            + config.azureBlobContainerName + '/' + blobName
                    };

                    entry.queue.push(message);

                    entry.azureBlobs = entry.azureBlobs || [];
                    entry.azureBlobs.push(blobName);

                    config.logger.silly('Uploaded blob to Azure Blob Storage', 
                        { id: id, contentType: contentType, length: length, uri: message.uri });

                    finishPost();
                });
        }
        else {
            // add non-JSON content to the queue as an attachment; include pollKey in the URL

            entry.attachments['' + entry.queue.length] = {
                contentType: contentType,
                body: body
            };

            var message = { 
                contentType: contentType,
                uri: config.relayBaseUri + id + '/' + entry.queue.length + '/attachment'
            };

            if (entry.params.pollKey) {
                message.uri += '/?key=' + encodeURIComponent(entry.params.pollKey);
            }

            entry.queue.push(message);

            config.logger.silly('Posting ' + contentType + ' message as attachment', 
                { id: id, contentType: contentType, length: body.length, uri: message.uri });

            finishPost();
        }

        function finishPost() {
            // reset inactivity timeout
            setInactivityTimeout(entry);

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
    }
};

exports.getAccount = function (accountId, callback) {
    var account = config.accounts[accountId];
    if (!account) {
        config.logger.warn('Cannot retrieve account', { accountId: accountId });
        callback({ code: 404, message: 'Account not found' });
    }
    else {
        callback(null, account);
    }
};
