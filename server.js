var phridge = require('phridge'),
    phantomPage = require('./phantom-page'),
    utils = require('./utils'),
    http = require('http'),
    Q = require('q');

var Server = function(options) {
    this.options = options || {};

    this.options.port = this.options.port || 3000;

    this.logger = options.logger;

    this.requests = [];
    this.servedPages = 0;
    this.isRequestProcessed = false;
};

Server.prototype.start = function() {
    this.instance = http.createServer(this.onRequest.bind(this));

    this.spawnPhantom();

    this.instance.listen(this.options.port, function () {
        this.logger.info('Server running on port ' + this.options.port);
    }.bind(this));
};

Server.prototype.spawnPhantom = function() {
    var disposeTimeout, deferred = Q.defer();

    this.servedPages = 0;

    if(this.phantom) {
        this.logger.info("Dispose Phantom");
        try {
            disposeTimeout = setTimeout(function() {
                if(deferred.promise.isPending()) {
                    this.logger.error("Phantom dispose timeout");
                    deferred.resolve();
                }
            }.bind(this), 20000)
            this.phantom.dispose().then(function () {
                this.logger.info("Phantom process terminated");
                deferred.resolve();
            }.bind(this)).catch(function(error){
                this.logger.error("Phantom process dispose error: " + error);
            });
        }
        catch (error) {
            this.logger.error("Phantom dispose error: " + error);
            deferred.resolve();
        }
        this.phantom = null;
    }
    else {
        deferred.resolve();
    }

    return deferred.promise.then(function() {
        if(disposeTimeout) {
            clearTimeout(disposeTimeout);
        }
        return this.spawnPhantomProcess(3);
    }.bind(this))
    .then(function (phantom) {
        this.logger.info('PhantomJS spawned');

        return phantom.run(this.options.workerId, function(workerId){
           this.workerId = workerId;
        }).then(function(){
            return phantom.run(phantomPage.setupResourceHandlers);
        }).then(function(){
            this.phantom = phantom;
        }.bind(this));
    }.bind(this))
    .then(this.tryServePage.bind(this))
    .done();
};

Server.prototype.spawnPhantomProcess = function(count) {
    this.logger.info('Spawn PhantomJS process');
    return phridge.spawn().catch(function(error) {
        if(count > 0) {
            this.logger.info('Error spawning phantom process - retry - error: ' + error);
            return Q.delay(1000).then(this.spawnPhantomProcess.bind(this, count - 1));
        }
        else {
            this.logger.error('Phantom spawn error: ' + error);
            process.exit();
        }
    }.bind(this));
};

Server.prototype.onRequest = function(req, res) {
    this.logger.info('New request url: ' + req.url + (typeof req.headers['user-agent'] !== 'undefined' ? ', user agent: ' + req.headers['user-agent'] : ''));

    req.escapedFragmentUrl = utils.getEscapedFragmentUrl(req);
    if(req.escapedFragmentUrl) {
        req.startTime = new Date();

        this.requests.push({
            req: req,
            res: res
        });
        this.logger.info('Still waiting requests: ' + (this.requests.length - 1));
        this.tryServePage();
    }
    else {
        res.writeHead(500);
        res.end('Missing _escaped_fragment_ parameter');
    }
};

Server.prototype.tryServePage = function() {
    if(this.phantom && this.options.pageRequestsBeforeRespawn && this.servedPages && this.servedPages === this.options.pageRequestsBeforeRespawn) {
        this.logger.info('Respawn PhantomJS');
        this.spawnPhantom();
    }
    else if(this.phantom && !this.isRequestProcessed && this.requests.length) {
        this.servePage();
    }
};

Server.prototype.servePage = function() {
    var request = this.requests.shift(),
        req = request.req,
        res = request.res,
        params = {
            url: this.options.url + req.escapedFragmentUrl,
            blacklistedDomains: this.options.blacklistedDomains
        };

    this.isRequestProcessed = true;
    req.startProcessingTime = new Date();

    this.logger.info('Serving page: ' +req.url);

    this.phantom.run(phantomPage.createWebPage)
    .then(function() {
        return this.phantom.run(params, function(options) {
            this.setOptions(options);
        });
    }.bind(this))
    .then(function() {
        return this.phantom.run(phantomPage.openWebPage);
    }.bind(this))
    .then(function () {
        return this.phantom.run(phantomPage.getPageContent);
    }.bind(this))
    .then(function(content){
        this.isRequestProcessed = false;

        if(content.indexOf('meta name="' + this.options.page404meta + '"') > -1) {
            res.writeHead(404);
        }
        res.end(content);

        this.servedPages += 1;
        this.logger.info('Page (' + req.url + ') served in ' + ((new Date() - req.startTime)/1000).toFixed(3) + 's, processed in ' + ((new Date() - req.startProcessingTime)/1000).toFixed(3) + 's');
        this.tryServePage();

    }.bind(this))
    .catch(function (err) {
        this.isRequestProcessed = false;
        this.servedPages += 1;

        this.logger.error('Phantom server error: ' + err.message);
        console.log(err.stack);

        res.writeHead(500);
        res.end('Error 500');
        this.tryServePage();
    }.bind(this));
};

module.exports = Server;
