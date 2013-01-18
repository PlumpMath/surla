 (function ($) {
    if (!$ || !$.fn)
        throw 'surlamobi requires jQuery library to be included in the page';

    var relayUrlBase = 'http://surla.mobi';

    $.fn.surlamobi = function (options) {

        var params = {
            interaction: {
                size: 400
            },
            done: defaultDone,
            message: defaultMessage,
            error: defaultError
        };

        if (!options.id) {
            params.useDataUri = false;
        }

        $.extend(true, params, options);

        // TODO: validate params

        return this.each(function () {
            function moveProperty(from, to, name) {
                to[name] = from[name];
                delete from[name];
            }

            var $this = $(this);
            var context = { target: $this, params: {} };
            $.extend(true, context.params, params);
            moveProperty(context.params, context, 'done');
            moveProperty(context.params, context, 'message');
            moveProperty(context.params, context, 'error');
            $this.data('surlamobi', context);
            createRelayEntry(context);
        });
    };

    function errorContext(context, text) {
        context.status = 'Error';
        context.err = new Error(text);
        context.error(context);
    }

    function createRelayEntry(context) {
        if (context.params.id) {
            // relay entry was created on the server; use it
            context.relayParams = { id: context.params.id };
            createQRCode(context);
        }
        else {
            context.status = 'CreatingRelayEntry';
            $.ajax({
                type: 'POST',
                url: relayUrlBase + '/r',
                contentType: 'application/json',
                data: JSON.stringify(context.params),
                processData: false,
                success: function(data, statusText, xhr) {
                    if (xhr.status === 201) {
                        context.relayParams = data;
                        createQRCode(context);
                    }
                    else {
                        errorContext(context, 'Unable to create relay entry. HTTP status: ' + xhr.status +
                            '. Body: ' + xhr.responseText);
                    }
                },
                error: function(xhr, statusText, err) {
                    errorContext(context, 'Unable to create relay entry. HTTP status: ' + xhr.status +
                        '. Status text: ' + statusText + '. Error: ' + err + 
                        '. Body: ' + xhr.responseText);
                }
            });
        }
    }

    function createQRCode(context) {
        context.status = 'CreatingQRCode';
        var qrData = relayUrlBase + '/v/' + context.relayParams.id;
        var qrImageUrl = 'https://chart.googleapis.com/chart' +
            '?chs=' + context.params.interaction.size + 'x' + context.params.interaction.size +
            '&cht=qr' +
            '&chl=' + escape(qrData);
        context.target.html('<a href="' + qrData + '"><img src="' + qrImageUrl + 
            '" width=' + context.params.interaction.size + ' height=' + context.params.interaction.size +' /></a>');

        startPolling(context);
    }

    function startPolling(context) {
        context.status = 'Polling';
        context.from = context.from || 0;
        $.ajax({
            type: 'GET',
            url: relayUrlBase + '/r/' + context.relayParams.id + '/' + context.from,
            success: function(data, statusText, xhr) {
                // successful response; data length may be zero if there are no new messages
                context.from += data.length;
                if (data.length > 0) {
                    context.message(data, context);
                }

                if (data.length > 0 && data[data.length - 1] === null) {
                    // relay entry has been closed - interaction has successfuly completed
                    context.status = 'Done';
                    context.done(context);
                }
                else {
                    startPolling(context);
                }
            },
            error: function(xhr, statusText, err) {
                if (xhr.status === 410) {
                    // entry expired at the relay without interaction finishing
                    delete context.from;
                    delete context.status;
                    delete context.pollErrorCount;
                    delete context.relayParams;
                    if (context.params.id) {
                        // relay was created on the server; error the context 
                        errorContext(context, 'Relay entry expired. HTTP status: 410');
                    }
                    else {
                        // entry was created on the client; create a new one
                        createRelayEntry(context);
                    }
                }
                else if (xhr.status === 416) {
                    // relay entry has been closed - interaction has successfuly completed
                    context.status = 'Done';
                    context.done(context);
                }
                else if (xhr.status === 404 || xhr.status === 400) {
                    // unexpected client side error
                    errorContext(context, 'Error polling relay entry. HTTP status: ' + xhr.status +
                        '. Status text: ' + statusText + '. Error: ' + err + 
                        '. Body: ' + xhr.responseText);
                }
                else {
                    // other error, retry polling up to 3 times before reporting an error
                    context.pollErrorCount = context.pollErrorCount || 0;
                    context.pollErrorCount++;
                    if (context.pollErrorCount === 3) {
                        errorContext(context, 'Unable to poll relay entry. HTTP status: ' + xhr.status +
                            '. Status text: ' + statusText + '. Error: ' + err + 
                            '. Body: ' + xhr.responseText);
                    }
                    else {
                        startPolling(context);
                    }
                }
            }
       });                
    }

    function defaultDone(context) {
        if (context.from === 0) {
            // no messages were received
            context.target.html('<div width=' + context.params.interaction.size 
                + ' height=' + context.params.interaction.size + '>&nbsp;</div>');
        }
    }

    function defaultMessage(data, context) {
        // empty
    }

    function defaultError(context) {
        context.target.html('<div width=' + context.params.interaction.size 
            + ' height=' + context.params.interaction.size + '>Error. Register error handler to capture.</div>');
        throw context.err;
    }

 })(jQuery);
