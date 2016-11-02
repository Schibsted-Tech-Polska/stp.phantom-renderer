/*globals webpage, fs*/
var phantomPage = {};

phantomPage.createWebPage = function(debug, resolve) {
    var self = this;

    self.logger.info('Opened Page: create web page');

    if(self.page) {
        self.page.close();
    }
    self.page = webpage.create();
    self.pageRequestsIds = [];
    self.pageRequestTimeouts = {};
    self.pageLoadFinished = false;
    self.checkIfPageLoadedFirstTimeoutValue = 3000;
    self.checkIfPageLoadedDefaultTimeoutValue = 100;

    self.checkIfPageLoadedTimeoutValue = this.checkIfPageLoadedFirstTimeoutValue;
    self.iframesUrls = [];

    // Set settings
    self.page.settings.loadImages = false;
    self.page.settings.resourceTimeout = 15000;

    // Set viewport
    self.page.viewportSize = {
        width: 1100,
        height: 800
    };

    // Attach function to run when opened page resource is requested
    self.page.onResourceRequested = self.onOpenedPageResourceRequested;

    // Attach function to run when opened page resource is received
    self.page.onResourceReceived =  self.onOpenedPageResourceReceived;

    self.page.onLoadFinished = self.onOpenedPageLoadFinished;

    self.page.onResourceError = self.onOpenedPageResourceError;

    self.page.onNavigationRequested = self.onOpenedPageNavigationRequested;

    if(debug && debug.js) {
        self.page.onError = function(msg, trace) {
            var msgStack = ['WEBPAGE ERROR: ' + msg];

            if(trace && trace.length) {
                msgStack.push('TRACE:');
                trace.forEach(function(t) {
                    msgStack.push(' -=> ' + (t.file || t.sourceURL) + ': ' + t.line + (t.function ? ' (in function "' + t.function + '")' : ''));
                });
            }

            self.logger.warn(msgStack.join('\n'));
        };

        self.page.onConsoleMessage = function(msg, lineNum, sourceId) {
            self.logger.debug('CONSOLE: ' + msg + ' (from line #' + lineNum + ' in "' + sourceId + '")');
        };
    }

    self.logger.info('Opened Page: web page created');

    resolve(self);
};

phantomPage.openWebPage = function (resolve) {
    var self = this;

    self.logger.info('Opened Page: open web page: ' + self.url);

    self.onPageLoaded = resolve;

    self.page.open(self.url);
};

phantomPage.getPageContent = function () {
    return this.page.content;
};

phantomPage.setupResourceHandlers = function() {
    var self = this;

    var relativeScriptPath = require('system').args[0];
    var absoluteScriptPath = fs.absolute(relativeScriptPath);
    var absoluteScriptDir = absoluteScriptPath.substring(0, absoluteScriptPath.lastIndexOf('/'));

    var projectPath = fs.absolute(absoluteScriptDir + '../../../../../');

    self.logger = require(projectPath + '/logger').logger;
    self.logger.setProcessInfo('Worker id #' + self.workerId);
    self.logger.info('Opened Page: setup');

    self.onOpenedPageLoadFinished = function() {
        self.pageLoadFinished = true;
    };

    self.onOpenedPageNavigationRequested = function(url, type, willNavigate, main) {
        if(!main) {
            self.iframesUrls.push(url);
        }
    };

    self.onOpenedPageResourceRequested = function(request, networkRequest) {
        if(self.isDataUrl(request.url)) {
            self.logger.info('Opened Page: Request (#' + request.id + ') data url: ' + self.formatUrl(request.url));
            networkRequest.abort();
            self.rescheduleCheckIfPageLoaded();
        }
        else if (self.isBlacklistedDomain(request.url)) {
            self.logger.info('Opened Page: Request (#' + request.id + ') domain blacklisted: ' + self.formatUrl(request.url));
            networkRequest.abort();
            self.rescheduleCheckIfPageLoaded();
        }
        else if(self.isIframeUrl(request.url)) {
            self.logger.info('Opened Page: Request (#' + request.id + ') iframe url: ' + self.formatUrl(request.url));
            networkRequest.abort();
            self.rescheduleCheckIfPageLoaded();
        }
        else {
            self.logger.info('Opened Page: Request (#' + request.id + '): ' + JSON.stringify(request.url));
            self.pageRequestsIds.push(request.id);

            // If request is not page open request
            if(request.id > 1) {
                // After first real request we update check if page loaded timeout
                self.checkIfPageLoadedTimeoutValue = self.checkIfPageLoadedDefaultTimeoutValue;

                // resourceTimeout in phantomjs doest always work so this should if it
                self.pageRequestTimeouts[request.id] = setTimeout(function() {
                    if(self.pageRequestsIds.indexOf(request.id) > -1) {
                        self.logger.info('Opened Page: Trigger Timeout (#' + request.id + '): ' + JSON.stringify(request.url));
                        // mock request stage
                        request.stage = 'end';
                        self.onOpenedPageResourceReceived(request);
                    }
                //}, self.page.settings.resourceTimeout + 1000);
                }, self.page.settings.resourceTimeout + 1000);
            }
        }
    };

    self.onOpenedPageResourceReceived = function(response) {
        if(response.stage === 'end' && self.pageRequestsIds.indexOf(response.id) > -1) {
            self.logger.info('Opened Page: Response (#' + response.id + '): ' + JSON.stringify(response.url));

            if(self.pageRequestTimeouts[response.id]) {
                clearTimeout(self.pageRequestTimeouts[response.id]);
            }
            if(self.checkIfPageLoadedTimeout) {
                clearTimeout(self.checkIfPageLoadedTimeout);
                self.checkIfPageLoadedTimeout = null;
            }
            self.removeRequestIdFromRequestArray(response.id);

            self.logger.info('Opened Page: Response requests left: ' + self.pageRequestsIds.length);
            if(self.pageRequestsIds.length === 0) {
                self.logger.info('Opened Page: Response schedule checkIfPageLoaded');
                self.checkIfPageLoadedTimeout = setTimeout(self.checkIfPageLoaded, self.checkIfPageLoadedTimeoutValue);
            }
        }
    };

    self.onOpenedPageResourceError = function(resourceError) {
        if(resourceError.errorCode !== 301 && resourceError.url) {
            self.logger.warn('Unable to load resource (#' + resourceError.id + ' URL:' + resourceError.url + '), Error code: ' + resourceError.errorCode + '. Description: ' + resourceError.errorString);
        }
    };

    self.removeRequestIdFromRequestArray = function(requestId) {
        var index = self.pageRequestsIds.indexOf(requestId);
        if(index > -1) {
            self.pageRequestsIds.splice(index, 1);
            return true;
        }
        return false;
    };

    self.checkIfPageLoaded = function() {
        self.logger.info('Check if page loaded');
        self.checkIfPageLoadedTimeout = null;
        if(self.pageRequestsIds.length === 0) {
            if(self.pageLoadFinished) {
                if(self.onPageLoaded) {
                    self.logger.info('Trigger onPageLoaded');
                    self.onPageLoaded();
                    self.onPageLoaded = null;
                }
                else {
                    self.logger.error('onPageLoaded called again');
                }
            }
            else {
                self.checkIfPageLoadedTimeout = setTimeout(self.checkIfPageLoaded, self.checkIfPageLoadedTimeoutValue);
            }

        }
    };

    self.rescheduleCheckIfPageLoaded = function() {
        if(self.checkIfPageLoadedTimeout) {
            self.logger.info('Opened Page: Request reschedule checkIfPageLoaded');
            clearTimeout(self.checkIfPageLoadedTimeout);
            self.checkIfPageLoadedTimeout = setTimeout(self.checkIfPageLoaded, self.checkIfPageLoadedTimeoutValue);
        }
    };

    self.setOptions = function(options) {
        self.url = options.url;
        self.blacklistedDomains = options.blacklistedDomains || [];
    };

    self.isBlacklistedDomain = function (url) {
        var self = this,
            domainRegex = /^https?\:\/\/(?:www\.)?([^\/?#]+)(?:[\/?#]|$)/i,
            domain = url.match(domainRegex);

        if(!domain || !domain[1]) {
            self.logger.info('Domain can not be parsed. Request url: ' + url);
            return true;
        }

        return (self.blacklistedDomains.indexOf(domain[1]) > -1);
    };

    self.isIframeUrl = function(url){
        var i, self = this;
        for(i = 0; i < self.iframesUrls.length; i++) {
            if(self.iframesUrls[i] === url) {
                return true;
            }
        }
        return false;
    };

    self.formatUrl = function (url) {
        if (self.isDataUrl(url)) {
            url = url.substring(0, 200) + '...';
        }
        return url;
    };

    self.isDataUrl = function (url) {
        return url.indexOf('data:') === 0;
    };

    self.logger.info('Opened Page: setup done');
};

module.exports = phantomPage;
