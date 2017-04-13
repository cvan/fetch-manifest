/* jshint node:true */
/* eslint-env es6 */

const urllib = require('url');

const utils = require('./utils.js');

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

  getArea (icon) {
    let density = icon.density ? (parseFloat(icon.density) || 1.0) : 1.0;
    let sizes = (icon.sizes || '').trim().toLowerCase();
    if (sizes === 'any') {
      return Number.MAX_SAFE_INTEGER;
    }
    let bestArea = -1;
    let area = -1;
    // Get the best area from `16x16 32x32 48x48 64x64 256x256` or `256x256`, for example.
    sizes.replace(/\s+/g, ' ').split(' ').forEach(size => {
      area = Math.pow((size || '0x0').replace(/\s*/g, '')
        .split('x')
        .map(size => parseInt(size, 10))
        .reduce((acc, val) => acc * val), density);
      if (area > bestArea) {
        bestArea = area;
      }
    });
    return bestArea;
  }

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
    function processDensityMember (image) {
      let value = (image.density || '').trim().replace(/\s+/, ' ');
      return value;
    }
    function processColorMember (image) {
      let value = (image.color || '').trim().replace(/\s+/, ' ');
      return value;
    }
    function processBackgroundColorMember (image) {
      let value = (image.background_color || image['background-color'] || image.backgroundColor || '').trim().replace(/\s+/, ' ');
      return value;
    }
    function processThemeColorMember (image) {
      let value = (image.theme_color || image['theme-color'] || image.themeColor || '').trim().replace(/\s+/, ' ');
      return value;
    }
    function processBorderRadiusMember (image) {
      let value = (image.border_radius || image['border-radius'] || image.borderRadius || '').trim().replace(/\s+/, ' ');
      return value;
    }

    function toImageObject (imageSpec) {
      const src = processSrcMember(imageSpec, baseURL);
      const type = processTypeMember(imageSpec);
      const sizes = processSizesMember(imageSpec);
      const density = processDensityMember(imageSpec);

      // These are the proprietary non-standard (non-spec'd) members.
      // See this section in the spec for details:
      //   - https://w3c.github.io/manifest/#proprietary-extensions
      //
      // The `color` member is used for Safari pinned-tab icons:
      //   - https://developer.apple.com/library/content/documentation/AppleApplications/Reference/SafariWebContent/pinnedTabs/pinnedTabs.html
      //
      const color = processColorMember(imageSpec);
      const backgroundColor = processBackgroundColorMember(imageSpec);
      const themeColor = processThemeColorMember(imageSpec);
      const borderRadius = processBorderRadiusMember(imageSpec);

      let imageObject = {
        src: src
      };

      if (type) {
        imageObject.type = type;
      }

      if (sizes) {
        imageObject.sizes = sizes;
      }

      if (density) {
        imageObject.density = density;
      }

      if (color) {
        imageObject.color = imageSpec.color;
      }

      // My own special goodies.
      if (backgroundColor) {
        imageObject.background_color = imageSpec.backgroundColor;
      }
      if (themeColor) {
        imageObject.theme_color = themeColor;
      }
      if (borderRadius) {
        imageObject.border_radius = borderRadius;
      }

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

  processFallback (docDOM, docURL) {
    return this.process(utils.getManifestFallback(docDOM, docURL), docURL, docURL);
  }

  // `process()` method processes JSON text into a clean manifest
  // that conforms with the W3C specification. Takes an object
  // expecting the following dictionary items:
  //  * jsonText: the JSON string to be processed (or an already parsed object).
  //  * manifestURL: the URL of the manifest, to resolve URLs.
  //  * docURL: the URL of the owner doc, for security checks.
  process (jsonText, manifestURL, docURL) {
    let rawManifest = {};

    if (typeof jsonText === 'object') {
      rawManifest = jsonText;
    } else {
      try {
        rawManifest = JSON.parse(jsonText);
      } catch (e) {
      }
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
      'background_color': processBackgroundColorMember()
    };
    processedManifest.scope = processScopeMember();

    let finalManifest = Object.assign({}, rawManifest, processedManifest);

    if (includeKey('processed_valid_manifest')) {
      finalManifest.processed_valid_manifest = processValidManifest();
    }

    if (includeKey('processed_gltf_icons')) {
      finalManifest.processed_gltf_icons = processGlTFIcons();
    }

    if (includeKey('processed_best_gltf_icon')) {
      finalManifest.processed_best_gltf_icon = processBestGlTFIcon();
    }

    if (includeKey('processed_best_svg_icon')) {
      finalManifest.processed_best_svg_icon = processBestSVGIcon();
    }

    if (includeKey('processed_best_bitmap_icon')) {
      finalManifest.processed_best_bitmap_icon = processBestBitmapIcon();
    }

    if (includeKey('processed_best_icon')) {
      finalManifest.processed_best_icon = processBestIcon();
    }

    if (includeKey('processed_best_favicon')) {
      finalManifest.processed_best_favicon = processBestFavicon();
    }

    if (includeKey('processed_best_badge')) {
      finalManifest.processed_best_badge = processBestBadge();
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
        case 'processed_gltf_icons':
        case 'processed_best_gltf_icon':
        case 'processed_best_svg_icon':
        case 'processed_best_bitmap_icon':
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

    function processGlTFIcons () {
      if ('processed_gltf_icons' in finalManifest) {
        return finalManifest.processed_gltf_icons;
      }
      let glTFIcons = [];
      if (finalManifest.icons && finalManifest.icons.length) {
        let icon;
        for (let i = 0; i < finalManifest.icons.length; i++) {
          icon = finalManifest.icons[i];
          if (icon.src.indexOf('.gltf') > -1 ||
              (icon.type && icon.type.indexOf('gltf') > -1)) {
            glTFIcons.push(icon);
            break;
          }
        }
      }
      return glTFIcons || [];
    }

    function processBestGlTFIcon () {
      if ('processed_best_gltf_icon' in finalManifest) {
        return finalManifest.processed_best_gltf_icon;
      }
      let glTFIcons = processGlTFIcons();
      let bestGlTFIcon = glTFIcons[0];
      let iconArea = -1;
      let bestGlTFIconArea = -1;
      glTFIcons.forEach(icon => {
        iconArea = imgObjProcessor.getArea(icon);
        if (!bestGlTFIcon || iconArea > bestGlTFIconArea) {
          bestGlTFIcon = icon;
          bestGlTFIconArea = iconArea;
        }
      });
      return bestGlTFIcon || null;
    }

    function processBestSVGIcon () {
      if ('processed_best_svg_icon' in finalManifest) {
        return finalManifest.processed_best_svg_icon;
      }
      let bestSVGIcon;
      if (finalManifest.icons && finalManifest.icons.length) {
        let iconArea = -1;
        let bestSVGIconArea = -1;
        finalManifest.icons.forEach(icon => {
          if (icon.src.indexOf('.svg') > -1 ||
              (icon.type && icon.type.indexOf('svg') > -1)) {
            iconArea = imgObjProcessor.getArea(icon);
            if (!bestSVGIcon || iconArea > bestSVGIconArea) {
              bestSVGIcon = icon;
              bestSVGIconArea = iconArea;
            }
          }
        });
      }
      return bestSVGIcon || null;
    }

    function processBestBitmapIcon () {
      if ('processed_best_bitmap_icon' in finalManifest) {
        return finalManifest.processed_best_bitmap_icon;
      }
      let bestBitmapIcon;
      if (finalManifest.icons && finalManifest.icons.length) {
        let iconArea = -1;
        let bestBitmapIconArea = -1;
        finalManifest.icons.forEach(icon => {
          if (icon.src.indexOf('.png') > -1 ||
              icon.src.indexOf('.jpg') > -1 || icon.src.indexOf('.jpe') > -1 ||
              icon.src.indexOf('.gif') > -1 ||
              icon.src.indexOf('.webp') > -1 ||
              icon.src.indexOf('.bmp') > -1 ||
              (icon.type && (icon.type.indexOf('png') > -1 ||
                             icon.type.indexOf('jpeg') > -1 ||
                             icon.type.indexOf('gif') > -1 ||
                             icon.type.indexOf('webp') > -1 ||
                             icon.type.indexOf('bmp') > -1))) {
            iconArea = imgObjProcessor.getArea(icon);
            if (!bestBitmapIcon || iconArea > bestBitmapIconArea) {
              bestBitmapIcon = icon;
              bestBitmapIconArea = iconArea;
            }
          }
        });
      }
      return bestBitmapIcon || null;
    }

    function processBestIcon () {
      if ('processed_best_icon' in finalManifest) {
        return finalManifest.processed_best_icon;
      }
      let bestIcon = processBestSVGIcon();
      let bestIconArea = bestIcon && bestIcon.sizes
        ? imgObjProcessor.getArea(bestIcon) : -1;
      if (finalManifest.icons && finalManifest.icons.length) {
        let iconArea = -1;
        finalManifest.icons.forEach(icon => {
          iconArea = imgObjProcessor.getArea(icon);
          if (!bestIcon || iconArea > bestIconArea) {
            bestIcon = icon;
            bestIconArea = iconArea;
          }
        });
      }
      return bestIcon || processBestBadge() || finalManifest.icons[0] || null;
    }

    function processBestFavicon () {
      if ('processed_best_favicon' in finalManifest) {
        return finalManifest.processed_best_favicon;
      }
      // TODO: Attempt to use `link[rel~="icon"]`, `link[rel$="-icon"]`, `link[rel~="favicon.ico"], `/favicon.ico`, etc.
      let bestFavicon;
      if (finalManifest.icons && finalManifest.icons.length) {
        let iconArea = -1;
        let bestFaviconArea = -1;
        finalManifest.icons.forEach(icon => {
          if (icon.src.indexOf('.ico') > -1 ||
              (icon.type && icon.type.indexOf('ico') > -1)) {
            iconArea = imgObjProcessor.getArea(icon);
            if (!bestFavicon || iconArea > bestFaviconArea) {
              bestFavicon = icon;
              bestFaviconArea = iconArea;
            }
          }
        });
      }
      return bestFavicon || processBestIcon() || null;
    }

    function processBestBadge () {
      if ('processed_best_badge' in finalManifest) {
        return finalManifest.processed_best_badge;
      }
      // TODO: Check for badge.
      return processBestIcon();
    }

    function processDirMember () {
      const value = (rawManifest.dir || '').trim();
      if (this.textDirections.has(value)) {
        return value;
      }
      return 'auto';
    }

    function processNameMember () {
      console.log('name', rawManifest);
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

      // Fall back to use the `homepage` key (à la npm's `package.json` format).
      if ('homepage' in rawManifest) {
        return urlProcessor.process(rawManifest, manifestURL, 'homepage');
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

      // The proper key name is `lang`, but fall back to use
      // `default_locale` (à la WebExtensions's `manifest.json` format).
      let value = (rawManifest.lang || rawManifest.default_locale || '').trim();
      if (!value) {
        value = 'en';
      }
      return value;
    }

    return Promise.resolve(finalManifest);
  }
}

module.exports = ManifestProcessor;
