/*jshint sub: true */
var url = require('url');

var utils = exports = module.exports = {};

// Normalizes unimportant differences in URLs - e.g. ensures
// http://google.com/ and http://google.com normalize to the same string
utils.normalizeUrl = function (u) {
    return url.format(url.parse(u, true));
};

utils.getEscapedFragmentUrl = function (req) {
    var decodedUrl
        , parts;

    try {
        decodedUrl = decodeURIComponent(req.url);
    } catch (e) {
        decodedUrl = req.url;
    }

    parts = url.parse(decodedUrl, true);

    // Remove the _escaped_fragment_ query parameter
    if (parts.query.hasOwnProperty('_escaped_fragment_')) {
        return  '#!' + parts.query['_escaped_fragment_'];
    }
    return null;
};