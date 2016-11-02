var logger = require('./logger').logger;
var Server = require('./server');

var Slave = function(settings) {
    this.config = settings.config;
    this.cluster = settings.cluster;
    this.debug = this.config.debug;

    this.server = null;

    logger.info('Worker ' + this.cluster.worker.id + ' started');
    logger.setProcessInfo('Worker id #' + this.cluster.worker.id);
};

Slave.prototype.setupWorker = function() {
    process.on('message', function(msg) {
        if('port' === msg.type) {
            this.onMessagePort(msg.port);
        } else if('requests' === msg.type) {
            this.onMessageRequests(msg.id);
        }
    }.bind(this));

    process.on('uncaughtException', function( err ) {
        console.error('Process uncaughtException');
        console.error(err.stack);
    });

    process.on("exit", function() {
       if(this.server && this.server.phantom) {
           logger.info('Process exit - dispose phantom');
           this.server.phantom.dispose();
       }
    }.bind(this));
};

Slave.prototype.onMessagePort = function(port) {
    this.server = new Server({
        logger: logger,
        url: this.config.url,
        acceptedUrls: this.config.acceptedUrls,
        port: port,
        workerId: this.cluster.worker.id,
        blacklistedDomains: this.config.blacklistedDomains,
        pageRequestsBeforeRespawn: this.config.pageRequestsBeforeRespawn,
        page404meta: this.config.page404meta,
        maxAge: this.config.maxAge,
        debug: this.debug
    });
    this.server.start();
};

Slave.prototype.onMessageRequests = function(requestId) {
    process.send({
        type: 'requests',
        id: requestId,
        count: this.server.requests.length
    });
};

module.exports = Slave;
