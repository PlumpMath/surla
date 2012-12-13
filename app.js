var express = require('express')
  , routes = require('./routes')
  , relay = require('./routes/relay.js')
  , config = require('./src/config.js')
  , http = require('http')
  , path = require('path');

var app = express();

app.configure(function(){
  app.set('port', process.env.PORT || config.port);
  app.set('views', __dirname + '/views');
  app.set('view engine', 'ejs');
  app.use(express.favicon());
  app.use(express.logger('dev'));
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(app.router);
  app.use(express.static(path.join(__dirname, 'public')));
});

app.configure('development', function(){
  app.use(express.errorHandler());
});

// the web site

app.get('/', routes.index);
app.get('/noun', routes.noun)

// the relay

app.post('/r', relay.create);
app.get('/r/:id', relay.poll); // assumes :from === 0
app.get('/r/:id/:from', relay.poll);
app.post('/r/:id', relay.post);

http.createServer(app).listen(app.get('port'), function(){
  config.logger.info("Express server listening on port " + app.get('port'));
});
