var urllib = require('url');

var Boom = require('boom');
var Hapi = require('hapi');
var Joi = require('joi');

var cheerio = require('cheerio');
require('es6-promise').polyfill();
var request = require('request');

var settings = module.exports.settings = require('../settings');
var ManifestProcessor = module.exports.ManifestProcessor = require('./processor');


var MANIFEST_KEYS_WITH_URLS = ['src', 'start_url'];
var NODE_ENV = process.env.NODE_ENVIRONMENT || 'development';

var resolveURL = module.exports.resolveURL = (docURL, relativeURL) => {

  // TODO: Handle case when origins mismatch.

  return urllib.resolve(docURL, relativeURL);
};

var isProbablyAManifestURL = module.exports.isProbablyAManifestURL = url => {

  return /(manifest\.webmanifest|manifest\.json|manifest\.webappmanifest|manifest\.webapp|webapp\.webmanifest|webapp\.json|webapp\.webappmanifest|webapp\.manifest|webapp\.json)$/i.test((url || '').split('?'));
};

var _processDocument = function (response, manifestURL, docURL, numOfNextManifestToAttemptToFetch) {

  return new Promise((resolve, reject) => {
    var manifests = [];

    if (docURL) {
      var $ = cheerio.load(response.body);
      var manifests = $('link[rel~="manifest"]');
      manifestURL = manifests.eq(0).attr('href');
    } else {
      docURL = response.request.href;
    }

    if (!manifests.length) {
      var manifestsToAttemptToFetch = [
        // TODO: Test these same URLs relative to `docURL`'s `origin`.
        () => fetchManifest(resolveURL(docURL, '/manifest.webmanifest'), null, docURL, true),
        () => fetchManifest(resolveURL(docURL, '/manifest.json'), null, docURL, true),
        () => fetchManifest(resolveURL(docURL, '/manifest.webappmanifest'), null, docURL, true),
        () => fetchManifest(resolveURL(docURL, '/manifest.webapp'), null, docURL, true),
        () => fetchManifest(resolveURL(docURL, '/webapp.webmanifest'), null, docURL, true),
        () => fetchManifest(resolveURL(docURL, '/webapp.json'), null, docURL, true),
        () => fetchManifest(resolveURL(docURL, '/webapp.webappmanifest'), null, docURL, true),
        () => fetchManifest(resolveURL(docURL, '/webapp.manifest'), null, docURL, true),
        () => fetchManifest(resolveURL(docURL, '/webapp.json'), null, docURL, true),
      ];
      // var foundManifest = false;
      if (typeof numOfNextManifestToAttemptToFetch === 'undefined') {
        numOfNextManifestToAttemptToFetch = 0;
      }
      var manifestAttempt = manifestsToAttemptToFetch[numOfNextManifestToAttemptToFetch];
      if (!manifestAttempt) {
        throw new Error('Could not find a `link[rel=manifest]` tag nor ' +
          'find a manifest at a guessed location');
      }
      return manifestAttempt().then(response => {
        resolve(response);
      }, err => {
        console.warn(err.message);
        resolve(_processDocument(response, manifestURL, docURL, ++numOfNextManifestToAttemptToFetch));
      });
    }

    var manifestURLAbsolute = resolveURL(docURL, manifestURL);
    return fetchManifest(manifestURLAbsolute, manifestURLAbsolute, docURL);
  });
};


var _processManifest = function (response, manifestURL, docURL) {

  return new Promise(function (resolve, reject) {

    var jsonText = response.body;

    if (typeof response.body === 'object') {
      jsonText = JSON.stringify(response.body);
    }

    var processor = new ManifestProcessor();

    return processor.process(jsonText, manifestURL, docURL).then(resolve);
  });
};


var _fetch = function (data) {

  return new Promise(function (resolve, reject) {

    request.get(data, function (err, response) {
      if (err) {
        reject(err);
      } else {
        resolve(response);
      }
    });
  });
};


var fetchManifest = module.exports.fetchManifest = function (data, manifestURL, docURL, tryOnce) {

  if (typeof data === 'string' &&
      (data.substr(0, 5) === 'http:' || data.substr(0, 6) === 'https:')) {

    const url = data;

    return _fetch(url).then(function (response) {

      if (response.statusCode !== 200) {
        return Promise.reject(new Error(
          `Unexpected response code (${response.statusCode}) for "${data}"`));
      }

      var contentType = response.headers['content-type'];

      var isDoc = contentType.indexOf('html') !== -1;
      var isJSON = contentType.indexOf('json') !== -1 || isProbablyAManifestURL(manifestURL);

      if (!tryOnce && (isDoc || !isJSON)) {
        docURL = manifestURL;
        return _processDocument(response, manifestURL, docURL);
      }
      if (!manifestURL) {
        manifestURL = data;
      }
      return _processManifest(response, manifestURL, docURL);
    });
  }

  const manifest = data;

  return _processManifest({body: manifest}, manifestURL, docURL);
};


var createServer = module.exports.createServer = function (opts) {

  opts = opts || {};

  if (!opts.server) {
    opts.server = new Hapi.Server();

    opts.server.connection({
      host: settings.HOST,
      port: settings.PORT,
      routes: {
        cors: settings.CORS,
        validate: {
          options: {
            abortEarly: false
          }
        }
      }
    });

    // Do not start the server when this script is required by another script.
    opts.server.start(function () {
      console.log('[%s] Listening on %s', NODE_ENV, opts.server.info.uri);
    });
  }

  var fetchHandler = {
    validate: {
      query: {
        url: Joi.string().regex(/^https?:\/\//i).required()
                .example('https://example.com/manifest.webapp')
      }
    },
    handler: function (request, reply) {
      fetchManifest(request.query.url)
      .then(reply)
      .catch(function (err) {
        console.error(err);
        reply(Boom.badRequest(err.message));
      });
    }
  };

  opts.server.route({
    method: 'GET', path: '/manifest', config: fetchHandler
  });

  return opts.server;
};
