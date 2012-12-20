 (function ($) {
    if (!$ || !$.fn)
        throw 'surlamobi requires jQuery library to be included in the page';

    var relayUrlBase = 'http://surla.mobi';

    $.fn.surlamobi = function (options) {

        var params = {
            maxQueueLength: 1,
            useDataUri: false,
            interaction: {
                type: 'FileUpload',
                size: 200
            }
        };

        $.extend(true, params, options);

        // TODO: validate params

        return this.each(function () {
            var $this = $(this);
            var context = { target: $this, params: {} };
            $.extend(true, context.params, params);
            $this.data('surlamobi', context);
            createRelayEntry(context);
        });
    };

    function errorContext(context, text) {
        context.status = 'Error';
        context.error = new Error(text);
        throw context.error;
    }

    function createRelayEntry(context) {
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

    function createQRCode(context) {
        context.status = 'CreatingQRCode';
        var qrData = relayUrlBase + '/v/' + context.relayParams.id;
        var qrImageUrl = 'https://chart.googleapis.com/chart' +
            '?chs=' + context.params.interaction.size + 'x' + context.params.interaction.size +
            '&cht=qr' +
            '&chl=' + escape(qrData);
        context.target.html('<a href="' + qrData + '"><img src="' + qrImageUrl + 
            '" width=' + context.params.interaction.size + ' height=' + context.params.interaction.size +' /></a>');
    }
   
 })(jQuery);
/*

 (function () {

    if (!$)
        throw "phone2web requires jQuery library to be included in the page";

    var relayurl = "http://relay.janczuk.org:31416/";
    var parameterEncoding = {
        name: 1,
        address: 2,
        city: 4,
        zip: 8,
        state: 16,
        phone: 32,
        email: 64,
        visa: 128          
    };
    
    // this is a client side JS library that helps fill out web forms using QR codes   
    
    function default_onresponse (options, response) {
        alert("got response from relay!");
    }

    function generate_qr_data(options) {
        var data = relayurl + "?h=" + window.location.hostname;
        var parameters = 0;
        for (var n in options.require) {
            parameters |= parameterEncoding[n];
        }

        data += "&p=" + parameters;

        // TODO, requestid should be assigned by the relay
        options.requestid = Math.floor(Math.random() * 1000000000); 
        data += "&id=" + options.requestid;

        return data;
    }

    function generate_qr_image_url(qrdata) {
        var url = "https://chart.googleapis.com/chart?chs=150x150&cht=qr&chl=" + escape(qrdata);

        return url;    
    }

    function stopPolling(options) {
        $(options.qr).html('QR inactive');
    }

    function processResponse(options, data) {
        for (var n in options.require) {
            if (data[n]) {
                $(options.require[n]).val(data[n]);
            }
        }
    }

    function startPolling(options) {
       $.ajax({
            url: relayurl + options.requestid,
            success: function(data, statusText, xhr) {
                processResponse(options, data);    
                stopPolling(options);
            },
            error: function(xhr, statusText, err) {
                if (xhr.status === 404) {
                    // data for that request is not available at the relay, resume polling
                    startPolling(options);
                }
                else {
                    // other error, stop polling and provide a hint to the browser user that QR support is off
                    stopPolling(options);
                }
            }
       });        
    }

    // find the <script> tag that references this script
    
    var self = null;
    
    for (var n in document.scripts) {
        if (document.scripts[n].src.toLowerCase().indexOf("phone2web.js") !== -1) {
            self = document.scripts[n];
            break; 
        }
    }

    if (!self)
        throw "A script tag that includes the phone2web.js script has not been found on the page."

    // parse the options of the script contained in the body of the <script> element

    var options = JSON.parse(self.text);

    if (typeof options !== "object")
        throw "The content of the script tag referencing the phone2web.js script must be a JSON object";

    // normalize options

    if (!options.require) {
        var newOptions = {
            require: {}
        };
        
        for (var n in options) {
            newOptions.require[options[n]] = "#" + options[n];
        }

        options = newOptions;
    }

    options.qr = options.qr || "#qr";
    options.onresponse = options.onresponse || function (response) {
        default_onresponse(options, response);
    }

    // generate the QR code data

    var qrdata = generate_qr_data(options);

    // generate the QR code image URL

    var qrimage = generate_qr_image_url(qrdata);

    // insert the QR image into the specified location on the page

    $(function() {
        $(options.qr).html('<img src="' + qrimage + '" width=150 height=150 />');
    });

    // start polling for the result

    startPolling(options);

})();
*/
