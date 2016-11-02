/*jshint sub: true */
var url = require('url');

var utils = exports = module.exports = {};

// Normalizes unimportant differences in URLs - e.g. ensures
// http://google.com/ and http://google.com normalize to the same string
utils.normalizeUrl = function (u) {
    return url.format(url.parse(u, true));
};

utils.decodeUrl = function(url) {
    var result;

    try {
        result = decodeURIComponent(url);
    } catch(e) {
        result = url;
    }

    return result;
};

utils.getEscapedFragmentUrl = function (req) {
    var decodedUrl = utils.decodeUrl(req.url);
    var parts = url.parse(decodedUrl, true);

    // Remove the _escaped_fragment_ query parameter
    if (parts.query.hasOwnProperty('_escaped_fragment_')) {
        return  '#!' + parts.query['_escaped_fragment_'];
    }
    return null;
};

utils.isAcceptedUrl = function(req, pattern) {
    var decodedUrl = utils.decodeUrl(req.url);
    var parts = url.parse(decodedUrl, true);
    var re = new RegExp(pattern);

    return re.test(parts.path);
};
