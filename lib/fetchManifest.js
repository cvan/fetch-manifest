var urllib = require('url');

var cheerio = require('cheerio');
var Prom = require('es6-promise').Promise;
var request = require('request');


var MANIFEST_KEYS_WITH_URLS = ['src', 'start_url'];


var _processDocument = function (response) {

  var $ = cheerio.load(response.body);
  var manifests = $('[rel=manifest]');

  if (!manifests.length) {
    return Prom.reject(new Error('Could not find `link[rel=manifest]` tag'));
  }

  var manifestUrl = manifests.eq(0).attr('href');
  var manifestUrlAbsolute = urllib.resolve(response.request.href, manifestUrl);

  return fetchManifest(manifestUrlAbsolute);
};


var _processManifest = function (response) {

  return new Prom(function (resolve, reject) {

    var recursiveTransformer = function(key, value) {
      // Resolve any relative URLs (the base URL being the manifest path).
      if (response.request && response.request.href &&
          typeof value === 'string' &&
          MANIFEST_KEYS_WITH_URLS.indexOf(key) !== -1 &&
          value.substr(0, 5) !== 'data:') {

        return urllib.resolve(response.request.href, value);
      }

      // Otherwise, leave the value untouched.
      return value;
    };

    var data = {};

    try {
      data = JSON.parse(response.body, recursiveTransformer);
    } catch (e) {
      return reject(new Error('String could not be parsed as JSON: ' +
                              e.message));
    }

    resolve(data);
  });
};


var _fetch = function (data) {

  return new Prom(function (resolve, reject) {

    request.get(data, function (err, response) {
      if (err) {
        reject(err);
      } else {
        resolve(response);
      }
    });
  });
};


var fetchManifest = module.exports = function (data) {

  if (typeof data === 'string' &&
      (data.substr(0, 5) === 'http:' || data.substr(0, 6) === 'https:')) {

    return _fetch(data).then(function (response) {
      if (response.statusCode !== 200) {
        return Prom.reject(new Error('Unexpected response code: ' +
                                     response.statusCode));
      }

      var contentType = response.headers['content-type'];

      if (contentType.indexOf('text/html') !== -1) {
        return _processDocument(response);

      } else if (contentType.indexOf('/json') !== -1) {
        return _processManifest(response);

      } else {
        return Prom.reject(new Error('Unexpected response Content-Type: ' +
                                     contentType));

      }
    });
  }

  return _processManifest({body: data});
};
