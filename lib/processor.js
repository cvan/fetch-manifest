/* jshint node:true */
/* eslint-env es6 */

const urllib = require('url');

/* Bits of this adapted from https://dxr.mozilla.org/mozilla-central/source/dom/manifest/ManifestProcessor.jsm */
const displayModes = new Set([
  'fullscreen',
  'standalone',
  'minimal-ui',
  'browser'
]);
const orientationTypes = new Set([
  'any',
  'natural',
  'landscape',
  'portrait',
  'portrait-primary',
  'portrait-secondary',
  'landscape-primary',
  'landscape-secondary'
]);
const textDirections = new Set([
  'ltr',
  'rtl',
  'auto'
]);

class URLProcessor {
  constructor (rawManifest, manifestURL) {
    this.rawManifest = rawManifest;
    this.manifestURL = manifestURL;
  }

  process (rawManifestObject, baseURL, memberName) {
    let value = rawManifestObject[memberName] || '.';
    if (typeof value !== 'string' || value.substr(0, 5) === 'data:') {
      return value;
    }
    // Resolve any relative URLs, using the manifest URL as the base URL.
    return urllib.resolve(baseURL, value);
  }
}

class ImageObjectProcessor {
  // constructor (rawManifest, manifestURL) {
  //   this.rawManifest = rawManifest;
  //   this.manifestURL = manifestURL;
  //   this.urlProcessor = new URLProcessor(manifestURL);
  // }

  process (rawManifest, baseURL, memberName) {
    let urlProcessor = new URLProcessor(rawManifest, baseURL);
    let value = memberName in rawManifest ? rawManifest[memberName] : {};
    let images = [];
    if (Array.isArray(value)) {
      value.filter(item => !!processSrcMember(item, baseURL))
        .map(toImageObject)
        .forEach(image => images.push(image));
    }
    function processSrcMember (image, baseURL) {
      return urlProcessor.process(image, baseURL, 'src');
    }
    function processTypeMember (image) {
      let value = (image.type || '').trim();
      return value;
    }
    function processSizesMember (image) {
      let value = (image.sizes || '').trim().replace(/\s+/, ' ');
      return value;
    }
    function toImageObject (imageSpec) {
      let imageObject = {
        'src': processSrcMember(imageSpec, baseURL),
        'type': processTypeMember(imageSpec),
        'sizes': processSizesMember(imageSpec)
      };
      return imageObject;
    }
    return images;
  }
}

class ManifestProcessor {
  get defaultDisplayMode () {
    return 'browser';
  }

  get displayModes () {
    return displayModes;
  }

  get orientationTypes () {
    return orientationTypes;
  }

  get textDirections () {
    return textDirections;
  }

  get URLProcessor () {
    return URLProcessor;
  }

  get ImageObjectProcessor () {
    return ImageObjectProcessor;
  }

  // `process()` method processes JSON text into a clean manifest
  // that conforms with the W3C specification. Takes an object
  // expecting the following dictionary items:
  //  * jsonText: the JSON string to be processed.
  //  * manifestURL: the URL of the manifest, to resolve URLs.
  //  * docURL: the URL of the owner doc, for security checks.
  process (jsonText, manifestURL, docURL) {
    let rawManifest = {};
    try {
      rawManifest = JSON.parse(jsonText);
    } catch (e) {
    }

    if (typeof rawManifest !== 'object' || rawManifest === null) {
      return Promise.reject(new Error('Manifest should be an object'));
    }

    rawManifest.start_url = rawManifest.start_url || '.';
    manifestURL = manifestURL || rawManifest.start_url;
    docURL = docURL || rawManifest.start_url;

    const urlProcessor = new URLProcessor(rawManifest, manifestURL);
    const imgObjProcessor = new ImageObjectProcessor(rawManifest, manifestURL);
    const processedManifest = {
      'dir': processDirMember.call(this),
      'lang': processLangMember(),
      'start_url': processStartURLMember(),
      'display': processDisplayMember.call(this),
      'orientation': processOrientationMember.call(this),
      'name': processNameMember(),
      'icons': imgObjProcessor.process(
        rawManifest, manifestURL, 'icons'
      ),
      'short_name': processShortNameMember(),
      'theme_color': processThemeColorMember(),
      'background_color': processBackgroundColorMember(),
    };
    processedManifest.scope = processScopeMember();

    let finalManifest = Object.assign({}, rawManifest, processedManifest);

    var bestFavicon = null;
    var bestIcon = null;
    var bestBadge = null;

    if (includeKey('processed_valid_manifest')) {
      finalManifest.processed_valid_manifest = processValidManifest();
    }

    if (includeKey('processed_best_icon')) {
      finalManifest.processed_best_icon = bestIcon = processBestIcon();
    }

    if (includeKey('processed_best_favicon')) {
      finalManifest.processed_best_favicon = processBestFavicon() || bestIcon;
    }

    if (includeKey('processed_best_badge')) {
      finalManifest.processed_best_badge = bestBadge = processBestBadge() || bestIcon;
    }

    if (includeKey('processed_manifest_url')) {
      finalManifest.processed_manifest_url = manifestURL;
    }

    if (includeKey('processed_final_manifest_url')) {
      finalManifest.processed_final_manifest_url = manifestURL;
    }

    if (includeKey('processed_document_url')) {
      finalManifest.processed_document_url = processDocumentURL();
    }

    if (includeKey('processed_final_document_url')) {
      finalManifest.processed_final_document_url = processFinalDocumentURL();
    }

    if (includeKey('processed_raw_manifest')) {
      finalManifest.processed_raw_manifest = rawManifest;
    }

    function includeKey (memberName) {
      switch (memberName) {
        case 'processed_valid_manifest':
        case 'processed_best_icon':
        case 'processed_best_favicon':
        case 'processed_best_badge':
        case 'processed_document_url':
          return true;
        case 'processed_manifest_url':
        case 'processed_final_manifest_url':
          return !!manifestURL;
        case 'processed_final_document_url':
          return !!docURL;
        case 'processed_raw_manifest':
          return !!rawManifest;
      }
      return false;
    }

    function processValidManifest () {
      return typeof rawManifest === 'object' && Object.keys(rawManifest).length > 0;
    }

    function processDocumentURL () {
      return docURL || finalManifest.start_url;
    }

    function processFinalDocumentURL () {
      return docURL;
    }

    function processBestIcon () {
      var bestIcon;
      if (finalManifest.icons && finalManifest.icons.length) {
        var icon;
        for (var i = 0; i < finalManifest.icons.length; i++) {
          icon = finalManifest.icons[i];
          if (icon.type && icon.type.indexOf('svg') > -1) {
            bestIcon = icon;
            break;
          }
          if (icon.sizes === 'any') {
            bestIcon = icon;
            break;
          }
        }
        if (!bestIcon) {
          bestIcon = finalManifest.icons[0];
        }
      }
      return bestIcon || null;
    }

    function processBestFavicon () {
      var bestFavicon;
      // TODO: Attempt to use `link[rel~="icon"]`, `link[rel~="favicon.ico"], `/favicon.ico`, etc.
      if (finalManifest.icons && finalManifest.icons.length) {
        var icon;
        for (var i = 0; i < finalManifest.icons.length; i++) {
          icon = finalManifest.icons[i];
          if (icon.src.indexOf('.ico') > -1 || (icon.type && icon.type.indexOf('ico') > -1)) {
            bestFavicon = icon;
            break;
          }
          if (icon.sizes === 'any') {
            bestFavicon = icon;
            break;
          }
        }
        if (!bestFavicon) {
          bestFavicon = finalManifest.icons[0];
        }
      }
      return bestFavicon || null;
    }

    function processBestBadge () {
      var bestBadge;
      if (finalManifest.icons && finalManifest.icons.length) {
        var icon;
        for (var i = 0; i < finalManifest.icons.length; i++) {
          icon = finalManifest.icons[i];
          // TODO: Check for badge.
        }
        bestBadge = finalManifest.icons[0];
      }
      return bestBadge || null;
    }

    function processDirMember () {
      const value = (rawManifest.dir || '').trim();
      if (this.textDirections.has(value)) {
        return value;
      }
      return 'auto';
    }

    function processNameMember () {
      return (rawManifest.name || '').trim();
    }

    function processShortNameMember () {
      return (rawManifest.short_name || '').trim();
    }

    function processOrientationMember () {
      const value = (rawManifest.orientation || '').trim();
      if (value && this.orientationTypes.has(value.toLowerCase())) {
        return value.toLowerCase();
      }
      return undefined;
    }

    function processDisplayMember () {
      const value = (rawManifest.display || '').trim();
      if (value && displayModes.has(value.toLowerCase())) {
        return value.toLowerCase();
      }
      return this.defaultDisplayMode;
    }

    function processScopeMember () {
      // TODO: Throw error if …
      // - the `scope` URL is invalid,
      // - the `start_url` is not within the scope of the URL, or
      // - the `scope` URL is cross-origin.
      if ('scope' in rawManifest) {
        return urlProcessor.process(rawManifest, manifestURL, 'scope');
      }
      return processStartURLMember();
    }

    function processStartURLMember () {
      // TODO: Throw error if …
      // - the `start_url` URL is invalid, or
      // - the `start_url` URL is cross-origin.
      if ('start_url' in rawManifest) {
        return urlProcessor.process(rawManifest, manifestURL, 'start_url');
      }
      return manifestURL;
    }

    function processThemeColorMember () {
      let value = (rawManifest.theme_color || '').trim();
      return value;
    }

    function processBackgroundColorMember () {
      let value = (rawManifest.background_color || '').trim();
      return value;
    }

    function processLangMember () {
      // TODO: Enhance to …
      // - use `franc` to detect the locale from the manifest text, and
      // - use `language-tags` to convert the locale ISO format.
      let value = (rawManifest.lang || '').trim();
      if (!value) {
        value = 'en';
      }
      return value;
    }

    return Promise.resolve(finalManifest);
  }
}

module.exports = ManifestProcessor;
