var fileConfig = require('./config.json')
    , winston = require('winston');

// For every setting FOO, override it with SURLA_FOO environment variable if defined
for (var i in fileConfig) {
    fileConfig[i] = process.env['SURLA_' + i.toUpperCase()] || fileConfig[i];
}

fileConfig.logger = winston;
winston.setLevels(winston.config.npm.levels);
winston.remove(winston.transports.Console);
winston.add(winston.transports.Console, { 
    colorize: true, 
    level: fileConfig.loggingLevelConsole,
    timestamp: true,
    handleExceptions: true 
});

module.exports = fileConfig;