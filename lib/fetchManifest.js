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

var _processDocument = function (response) {

  var $ = cheerio.load(response.body);
  var manifests = $('link[rel~="manifest"]');

  if (!manifests.length) {
    return Promise.reject(new Error('Could not find a `link[rel=manifest]` tag'));
  }

  var docURL = response.request.href;
  var manifestURL = manifests.eq(0).attr('href');
  var manifestURLAbsolute = urllib.resolve(docURL, manifestURL);

  return fetchManifest(manifestURLAbsolute, manifestURLAbsolute, docURL);
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


var fetchManifest = module.exports.fetchManifest = function (data, manifestURL, docURL) {

  if (typeof data === 'string' &&
      (data.substr(0, 5) === 'http:' || data.substr(0, 6) === 'https:')) {

    return _fetch(data).then(function (response) {

      if (response.statusCode !== 200) {
        return Promise.reject(new Error('Unexpected response code: ' +
                                        response.statusCode));
      }

      var contentType = response.headers['content-type'];

      if (contentType.indexOf('text/html') !== -1) {
        return _processDocument(response, manifestURL, docURL);

      } else {
        return _processManifest(response, manifestURL, docURL);

      }
    });
  }

  return _processManifest({body: data}, manifestURL, docURL);
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
        reply(Boom.badRequest(err.message));
      });
    }
  };

  opts.server.route({
    method: 'GET', path: '/manifest', config: fetchHandler
  });

  return opts.server;
};
