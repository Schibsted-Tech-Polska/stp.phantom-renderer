var logger,
    colors = require('colors'),
    dateFormat = require('dateformat');

logger = {
    timestamp: "yyyy-mm-dd HH:MM:ss.l",
    processInfo: null,
    events: {
        info: { color: 'green', event: 'info' },
        warn: { color: 'yellow', event: 'warning' },
        error: { color: 'red', event: 'error' }
    },
    info: function(message) {
        logger.write("info", message);
    },
    error: function(message) {
        logger.write("error", message);
    },
    warn: function(message) {
        logger.write("warn", message);
    },
    write: function(type, message) {
        var processInfoMsg = logger.processInfo ? '  - ' + logger.processInfo : '';
        console.log(dateFormat( new Date(), this.timestamp) + processInfoMsg + '  - ' + this.events[type].event[this.events[type].color] + ': ' + message);
    },
    setProcessInfo: function(processInfo) {
        logger.processInfo = processInfo;
    }
};

exports.logger = {
    setProcessInfo: logger.setProcessInfo,
    info: logger.info,
    error: logger.error,
    warn: logger.warn
};