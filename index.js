var cluster = require('cluster'),
    logger = require('./logger').logger,
    argv = require('minimist')(process.argv.slice(2)),
    Master = require('./master'),
    Slave = require('./slave'),
    config;

// Get proper config file
if(argv.config) {
    config = require('./' + argv.config);
}
else {
    config = require('./config');
}

if(argv.port) {
    config.port = argv.port;
}
if(argv.url) {
    config.url = argv.url;
}

config.debug = {};
if(true === argv['debug-phantom']) {
    config.debug.phantom = true;
}
if(true === argv['debug-network']) {
    // TODO: handle this; gather all the phantom-page network usage and dump a good log
    config.debug.network = true;
}
if(true === argv['debug-js']) {
    config.debug.js = true;
}
if(true === argv['debug-load']) {
    config.debug.load = true;
}

if(!config.port) {
    logger.error('Please provide port with "--port" option');
    process.exit();
}

if(!config.url) {
    logger.error('Please provide url with "--url" option');
    process.exit();
}

if(cluster.isMaster) {
    var master = new Master({
        config: config,
        cluster: cluster
    });

    master.setupWorkers();
    master.setupProxy();
    master.setupServer();
} else {
    var slave = new Slave({
        config: config,
        cluster: cluster
    });

    slave.setupWorker();
}
