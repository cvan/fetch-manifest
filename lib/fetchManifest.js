/* jshint node: true */
/* eslint-env es6, node */

const urllib = require('url');

const Boom = require('boom');
const Hapi = require('hapi');
const Joi = require('joi');

const cheerio = require('cheerio');
require('es6-promise').polyfill();
const rp = require('request-promise');

const settings = module.exports.settings = require('../settings');
const ManifestProcessor = module.exports.ManifestProcessor = require('./processor');

const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_DEV = NODE_ENV === 'development';

const resolveURL = module.exports.resolveURL = (docURL, relativeURL) => {
  // TODO: Handle case when origins mismatch.
  return urllib.resolve(docURL, relativeURL);
};

function autoParse (docURL) {
  return (body, response) => {
    docURL = docURL || null;
    let url = response ? response.request.uri.href : null;
    let json = null;
    let text = body;
    if (typeof body === 'object') {
      json = body;
      try {
        text = JSON.stringify(body);
      } catch (err) {
        if (IS_DEV) {
          console.warn('Could not stringify text as JSON%s',
            body && typeof body === 'string' ? ': ' + body.split('\n')[0].substr(0, 30) + ' …' : '');
        }
      }
    }
    if (!json) {
      try {
        json = JSON.parse(body);
      } catch (err) {
        if (IS_DEV) {
          console.warn('Could not parse text as JSON%s',
            body && typeof body === 'string' ? ': ' + body.split('\n')[0].substr(0, 30) + ' …' : '');
        }
      }
    }
    if (json && typeof json === 'object') {
      return {
        manifestURL: url,
        docURL: docURL,
        json: json,
        html: null,
        text: text
      };
    }
    const bodyLower = (body || '').toLowerCase();
    if (bodyLower.indexOf('doctype') > -1 || bodyLower.indexOf('<body') > -1 ||
        (response && response.headers && response.headers['content-type'] &&
         response.headers['content-type'].includes('html'))) {
      return {
        manifestURL: null,
        docURL: url,
        json: null,
        html: cheerio.load(body),
        text: text
      };
    }
    return {
      manifestURL: null,
      docURL: url,
      json: null,
      html: null,
      text: text
    };
  };
}

function autoParseManifest (autoParsedBody) {
  if (autoParsedBody.html) {
    let $ = autoParsedBody.html;
    let manifests = $('link[rel~="manifest"]');
    if (manifests.length) {
      let manifestURL = resolveURL(autoParsedBody.docURL, manifests.eq(manifests.length - 1).attr('href'));
      return fetchManifest(manifestURL, autoParsedBody.docURL);
    }
  } else if (autoParsedBody.json) {
    const processor = new ManifestProcessor();
    return processor.process(autoParsedBody.text, autoParsedBody.manifestURL, autoParsedBody.docURL);
  }
  return Promise.resolve({
    processed_valid_manifest: false,
    processed_manifest_url: autoParsedBody.manifestURL,
    processed_final_manifest_url: autoParsedBody.manifestURL,
    processed_document_url: autoParsedBody.docURL,
    processed_final_document_url: autoParsedBody.docURL,
    processed_raw_manifest: autoParsedBody.text
  });
}

const fetchManifest = module.exports.fetchManifest = function (manifestURL, docURL) {
  if (typeof manifestURL === 'string' &&
      (manifestURL.startsWith('http:') || manifestURL.startsWith('https:'))) {
    return rp({
      uri: manifestURL,
      transform: autoParse(docURL),
      resolveWithFullResponse: true
    }).then(autoParseManifest);
  } else {
    let manifestJSONOrHTML = arguments[0];
    return Promise.resolve(autoParseManifest(autoParse(docURL)(manifestJSONOrHTML)));
  }
};

module.exports.createServer = function (opts) {
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

  function fixManifestURL (request, reply) {
    let manifestURLPath = request.url.pathname;
    if (manifestURLPath.startsWith('/manifest/')) {
      manifestURLPath = manifestURLPath.substr(0, '/manifest/'.length);
    }
    let manifestURL;
    if (request.query.url) {
      manifestURL = request.query.url;
    } else {
      // Remove leading slashes, if any.
      manifestURL = manifestURLPath.replace(/^\/+/g, '');
    }
    if (manifestURL.indexOf('/') === -1 &&
        manifestURL.indexOf('.com') === -1 &&
        manifestURL.indexOf('.org') === -1 &&
        manifestURL.indexOf('.net') === -1 &&
        manifestURL.indexOf('.io') === -1 &&
        manifestURL.indexOf('.rocks') === -1 &&
        manifestURL.indexOf('.co.') === -1) {
      return reply.continue();
    }
    if (manifestURL.startsWith('//')) {
      manifestURL = 'https://' + manifestURL.substr(2);
    } else if (!manifestURL.startsWith('http:') && !manifestURL.startsWith('https:')) {
      manifestURL = 'https://' + manifestURL;
    }
    let manifestURLParsed = urllib.parse(manifestURL);
    let protocol = manifestURLParsed.protocol || 'https:';
    let newManifestURL = protocol + '//' + manifestURLParsed.host + (manifestURLParsed.path || '/');
    request._fixedManifestURL = request.query.url = newManifestURL;
    fetchHandler(request, reply);
  }

  function fetchHandler (request, reply, source, error) {
    let manifestURL = request.query.url;
    if (error && source === 'query') {
      fixManifestURL(request, reply);
      return;
    }
    fetchManifest(manifestURL)
      .then(reply)
      .catch(err => {
        if (err.name === 'StatusCodeError' && err.statusCode === 404 &&
            manifestURL.startsWith('https:')) {
          // If the request failed for a `https:` URL, retry with `http:` one time.
          return fetchManifest(manifestURL.replace(/^https:/, 'http:'))
            .then(reply)
            .catch(handleErrors);
        }
        return handleErrors(err);
      });
    function handleErrors (err) {
      console.error(err);
      const errMsg = err.name === 'StatusCodeError' ? err.statusCode : err.message;
      reply(Boom.badRequest(errMsg));
      return errMsg;
    }
  }

  const fetchConfig = {
    validate: {
      query: {
        url: Joi.string().regex(/^https?:\/\//i).required()
                .example('https://example.com/manifest.webapp')
      },
      failAction: fetchHandler
    },
    handler: fetchHandler
  };

  opts.server.ext('onPreResponse', function (request, reply) {
    if (request._fixedManifestURL ||
        request.response.statusCode && request.response.statusCode === 200 ||
        (!request.response.output || !request.response.output.statusCode ||
         (request.response.output.statusCode !== 400 &&
         request.response.output.statusCode !== 404))) {
      return reply.continue();
    }
    fixManifestURL(request, reply);
  });

  opts.server.route({
    method: 'GET',
    path: '/manifest/{p?}',
    config: fetchConfig
  });

  return opts.server;
};
