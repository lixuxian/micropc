var log4js = require('log4js');

var time = Date.now();

log4js.configure({
  appenders: {
    gasLogs: { type: 'file', filename: './log/gascost_' + time + '.log' },
    channelLogs: { type: 'file', filename: './log/channels_' + time + '.log' },
    console: { type: 'console' }
  },
  categories: {
    gas: { appenders: ['gasLogs'], level: 'info' },
    channel: { appenders: ['channelLogs'], level: 'info' },
    another: { appenders: ['console'], level: 'trace' },
    default: { appenders: ['console', 'gasLogs'], level: 'trace' }
  }
});

gasLogger = log4js.getLogger('gas');
channelLogger = log4js.getLogger('channel');
module.exports.gasLogger = gasLogger;
module.exports.channelLogger = channelLogger;