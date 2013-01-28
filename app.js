var express = require('express')
  , routes = require('./routes')
  , relay = require('./routes/relay.js')
  , interaction = require('./routes/interaction.js')
  , config = require('./src/config.js')
  , http = require('http')
  , path = require('path')
  , surlaware = require('./src/surlaware.js')
  , authentication = require('./routes/authentication.js')
  , security = require('./routes/security.js');

var app = express();

app.configure(function(){
  app.set('port', process.env.PORT || config.port);
  app.set('views', __dirname + '/views');
  app.set('view engine', 'ejs');
  app.use(express.favicon());
  app.use(express.logger('dev'));
  app.use(express.cookieParser());
  app.use(express.bodyParser());
  app.use(surlaware.bodyBuffer());
  app.use(express.methodOverride());
  app.use(app.router);
  app.use(express.static(path.join(__dirname, 'public')));
});

app.configure('development', function(){
  app.use(express.errorHandler());
});

// the web site

app.options('*', routes.options);

app.get('/', routes.index);
app.get('/noun', routes.noun);
app.get('/upload', routes.upload);
app.get('/sniffer', routes.sniffer);
app.get('/remote', routes.remote);
app.get('/login', routes.login);
app.get('/payment', routes.payment);
app.get('/chat', routes.chat);

// the relay

app.post('/r', relay.addCommonResponseHeaders, relay.create); // security built into route handler
app.all('/r/*', relay.addCommonResponseHeaders);
app.get('/r/:id', security.createRelaySecurity('poll'), relay.poll); // assumes :from === 0
app.get('/r/:id/stats', security.createRelaySecurity('get'), relay.stats); 
app.get('/r/:id/:position/attachment', security.createRelaySecurity('poll'), relay.getAttachment);
app.get('/r/:id/:from', security.createRelaySecurity('poll'), relay.poll);
app.post('/r/:id', security.createRelaySecurity('post'), relay.post);

// the interaction views

app.get('/v/:id', interaction.get);
app.post('/v/:id', interaction.post);
app.get('/login/facebook', authentication.getFacebook);
app.get('/login/twitter', authentication.getTwitter);

http.createServer(app).listen(app.get('port'), function(){
  config.logger.info("Express server listening on port " + app.get('port'));
});
