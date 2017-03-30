/* jshint node: true */
/* eslint-env es6, node */

const path = require('path');
const urllib = require('url');

const Boom = require('boom');
const Hapi = require('hapi');
const HapiInert = require('inert');
const Joi = require('joi');

const cheerio = require('cheerio');
require('es6-promise').polyfill();
const rp = require('request-promise');

const settings = module.exports.settings = require('../settings');
const ManifestProcessor = module.exports.ManifestProcessor = require('./processor');

const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_DEV = NODE_ENV === 'development';
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const resolveURL = module.exports.resolveURL = (docURL, relativeURL) => {
  // TODO: Handle case when origins mismatch.
  return urllib.resolve(docURL, relativeURL);
};

function autoParse (docURL, docHTML) {
  return (body, response) => {
    docURL = docURL || null;
    let url = response ? response.request.uri.href : null;
    let json = null;
    let text = body;
    let html = docHTML;
    let dom = html ? cheerio.load(html) : null;
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
        html: html,
        dom: dom,
        text: text
      };
    }
    const bodyLower = (body || '').toLowerCase();
    if (bodyLower.indexOf('doctype') > -1 || bodyLower.indexOf('<body') > -1 ||
        (response && response.headers && response.headers['content-type'] &&
         response.headers['content-type'].includes('html'))) {
      if (!html) {
        html = body;
      }
      if (!dom) {
        dom = cheerio.load(body);
      }
      return {
        manifestURL: null,
        docURL: url,
        json: null,
        html: body,
        dom: dom,
        text: text
      };
    }
    return {
      manifestURL: null,
      docURL: url,
      json: null,
      html: html,
      dom: dom,
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
      return fetchManifest(manifestURL, autoParsedBody.docURL, autoParsedBody.dom);
    }
  } else if (autoParsedBody.json) {
    const processor = new ManifestProcessor();
    return processor.process(autoParsedBody.text, autoParsedBody.manifestURL, autoParsedBody.docURL, autoParsedBody.dom);
  }
  return Promise.resolve({
    processed_valid_manifest: false,
    processed_manifest_url: autoParsedBody.manifestURL,
    processed_final_manifest_url: autoParsedBody.manifestURL,
    processed_document_url: autoParsedBody.docURL,
    processed_final_document_url: autoParsedBody.docURL,
    processed_raw_manifest: autoParsedBody.text,
    processed_raw_document_html: autoParsedBody.html
  });
}

const fetchManifest = module.exports.fetchManifest = function (manifestURL, docURL, docHTML) {
  if (typeof manifestURL === 'string' &&
      (manifestURL.startsWith('http:') || manifestURL.startsWith('https:'))) {
    return rp({
      uri: manifestURL,
      transform: autoParse(docURL, docHTML),
      resolveWithFullResponse: true
    }).then(autoParseManifest);
  } else {
    let manifestJSONOrHTML = arguments[0];
    return Promise.resolve(autoParseManifest(autoParse(docURL, docHTML)(manifestJSONOrHTML)));
  }
};

module.exports.createServer = function (opts) {
  opts = opts || {};

  if (!opts.server) {
    opts.server = new Hapi.Server({
      connections: {
        routes: {
          files: {
            relativeTo: PUBLIC_DIR
          }
        }
      }
    });

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

    opts.server.register(HapiInert, err => {
      if (err) {
        console.error(err);
        throw err;
      }

      // Do not start the server when this script is required by another script.
      opts.server.start(function () {
        console.log('[%s] Listening on %s', NODE_ENV, opts.server.info.uri);
      });
    });
  }

  function fixManifestURL (request, reply, replyContinue) {
    let manifestURLPath = request.url.pathname;
    if (manifestURLPath.startsWith('/manifest/')) {
      manifestURLPath = manifestURLPath.substr(0, '/manifest/'.length);
    }

    let manifestURLSearch = request.url.search ? request.url.search.substr(1) : '';
    if (manifestURLSearch.startsWith('https:') || manifestURLSearch.startsWith('http:')) {
      request.query.url = manifestURLSearch;
    }
    let manifestURL = request.query.url ? request.query.url : manifestURLPath;

    // Remove leading slashes, if any.
    manifestURL = manifestURL.replace(/^\/+/g, '');

    if (manifestURL.indexOf('/') === -1 &&
        manifestURL.indexOf('.com') === -1 &&
        manifestURL.indexOf('.org') === -1 &&
        manifestURL.indexOf('.net') === -1 &&
        manifestURL.indexOf('.io') === -1 &&
        manifestURL.indexOf('.rocks') === -1 &&
        manifestURL.indexOf('.co.') === -1) {
      if (replyContinue) {
        reply.continue();
      }
      return false;
    }
    if (manifestURL.startsWith('//')) {
      manifestURL = 'https://' + manifestURL.substr(2);
    } else if (!manifestURL.startsWith('https:') && !manifestURL.startsWith('http:')) {
      manifestURL = 'https://' + manifestURL;
    }
    let manifestURLParsed = urllib.parse(manifestURL);
    let protocol = manifestURLParsed.protocol || 'https:';
    let newManifestURL = protocol + '//' + manifestURLParsed.host + (manifestURLParsed.path || '/');
    request._fixedManifestURL = request.query.url = newManifestURL;
    fetchHandler(request, reply);
    return newManifestURL;
  }

  function fetchHandler (request, reply, source, error) {
    let manifestURL = request.query.url;
    if (!error) {
      Joi.validate(manifestURL, fetchConfig.validate.query.url, (err, value) => {
        if (err) {
          fetchHandler(request, reply, 'query', err);
        } else {
          next();
        }
      });
      return;
    }
    next();
    function next () {
      if (error && source === 'query') {
        fixManifestURL(request, reply, true);
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
      reply.continue();
      return;
    }
    fixManifestURL(request, reply);
  });

  opts.server.ext('onPostHandler', function (request, reply) {
    const response = request.response;
    if (response.isBoom && response.output.statusCode === 404) {
      return reply.file('404.html').code(404);
    }
    return reply.continue();
  });

  ['css', 'fonts', 'img', 'js'].forEach(dir => {
    opts.server.route({
      method: 'GET',
      path: `/${dir}/{p?}`,
      handler: {
        directory: {
          path: path.join(PUBLIC_DIR, dir),
          redirectToSlash: false,
          index: true
        }
      }
    });
  });

  opts.server.route({
    method: 'GET',
    path: '/{p?}',
    handler: function (request, reply) {
      var fixedManifestURL = fixManifestURL(request, reply, false);
      if (fixedManifestURL === false) {
        serve();
      }
      function serve () {
        var filepath = request.url.pathname;
        if (filepath.endsWith('/')) {
          filepath = path.join(filepath, 'index.html');
        }
        return reply.file(filepath.substr(1));
      }
    }
  });

  opts.server.route({
    method: 'GET',
    path: '/manifest/{p?}',
    config: fetchConfig
  });

  return opts.server;
};
