var urllib = require('url');

var Boom = require('boom');
var Hapi = require('hapi');
var Joi = require('joi');

var cheerio = require('cheerio');
var Prom = require('es6-promise').Promise;
var request = require('request');

var settings = require('../settings');


var MANIFEST_KEYS_WITH_URLS = ['src', 'start_url'];
var NODE_ENV = process.env.NODE_ENVIRONMENT || 'development';


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

    var recursiveTransformer = function (key, value) {
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


var fetchManifest = module.exports.fetchManifest = function (data) {

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
                .example('http://example.com/')
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
