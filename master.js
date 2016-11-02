var logger = require('./logger').logger;
var getPort = require('get-port');
// var _ = require('lodash');
var httpProxy = require('http-proxy');
var http = require('http');

var Master = function(settings) {
    this.config = settings.config;
    this.cluster = settings.cluster;
    this.debug = this.config.debug;

    this.workerServersInfo = {};
    this.proxy = null;
    this.server = null;

    this.requests = {};
    this.requestCounter = 0;

    if (this.config.uid && process.getuid && process.setuid) {
        logger.info('Current uid: ' + process.getuid());
        try {
            process.setuid(this.config.uid);
            logger.info('New uid: ' + process.getuid());
        }
        catch (err) {
            logger.info('Failed to set uid: ' + err);
        }
    }
    if (this.config.gid && process.getgid && process.setgid) {
        logger.info('Current gid: ' + process.getgid());
        try {
            process.setgid(this.config.gid);
            logger.info('New gid: ' + process.getgid());
        }
        catch (err) {
            logger.info('Failed to set gid: ' + err);
        }
    }
};

Master.prototype.setupWorkers = function() {
    for (var i = 0; i < (this.config.workers || 2); i += 1) {
        logger.info('Starting worker thread #' + (i + 1));
        this.spawnWorker();
    }

    this.cluster.on('exit', function (worker) {
        logger.info('Worker ' + worker.id + ' died.');

        delete this.workerServersInfo['server-' + worker.id];

        // spin up another to replace it
        logger.info('Restarting worker thread...');
        this.spawnWorker();
    }.bind(this));
};

Master.prototype.spawnWorker = function() {
    getPort(function (err, port) {
        var worker = this.cluster.fork();
        var workerServerInfo = {worker: worker, port: port};

        worker.on('message', function(msg) {
            if('requests' === msg.type) {
                this.onMessageRequests(workerServerInfo, msg.id, msg.count);
            }
        }.bind(this));

        this.workerServersInfo['server-' + worker.id] = workerServerInfo;

        worker.send({type: 'port', port: port});
    }.bind(this));
};

Master.prototype.onMessageRequests = function(workerServerInfo, requestId, count) {
    if(this.debug.load) {
        logger.debug('Received info for #req-' + requestId + ' from #' + workerServerInfo.worker.id + ' with count: ' + count);
    }

    var requestKey = 'req-' + requestId;
    var requestInfo = this.requests[requestKey];

    requestInfo.workersReceived.push({worker: workerServerInfo.worker, port: workerServerInfo.port, count: count});

    if(requestInfo.workersAwaiting === requestInfo.workersReceived.length) {
        var proxyInfo = requestInfo.workersReceived[0];

        for(var i = 1; i < requestInfo.workersReceived.length; ++i) {
            if(requestInfo.workersReceived[i].count < proxyInfo.count) {
                proxyInfo = requestInfo.workersReceived[i];
            }
        }

        this.proxy.web(requestInfo.req, requestInfo.res, {target: 'http://127.0.0.1:' + proxyInfo.port});

        if(this.debug.load) {
            logger.debug('Chosen #' + proxyInfo.worker.id + ' for #req-' + requestId + ' with count: ' + proxyInfo.count);
        }

        delete this.requests[requestKey];
    }
};

Master.prototype.setupProxy = function() {
    this.proxy = httpProxy.createProxyServer({});

    this.proxy.on('error', function (err, req, res) {
        res.writeHead(500, {
            'Content-Type': 'text/plain'
        });
        res.end('Something went wrong');
    });

    logger.info('Proxy created');
};

Master.prototype.setupServer = function() {
    this.server = http.createServer(function(req, res) {
        this.requestCounter++;

        var requestKey = 'req-' + this.requestCounter;
        this.requests[requestKey] = {req: req, res: res, workersAwaiting: 0, workersReceived: []};

        if(this.debug.load) {
            logger.debug('Asking workers for request count #' + requestKey);
        }

        for(var workerServerKey in this.workerServersInfo) {
            if(this.workerServersInfo.hasOwnProperty(workerServerKey)) {
                this.workerServersInfo[workerServerKey].worker.send({type: 'requests', id: this.requestCounter});
                this.requests[requestKey].workersAwaiting++;
            }
        }
    }.bind(this));

    logger.info('Master listening on port ' + this.config.port);
    this.server.listen(this.config.port);
};

module.exports = Master;
