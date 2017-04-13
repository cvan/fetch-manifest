const mime = require('./mime.js');

module.exports.getExtName = filename => {
  filename = (filename || '')
    .trim()
    .replace(/([?#].+)$/g, '')
    .replace(/\s/g, '');
  return filename.substring(filename.lastIndexOf('.') + 1);
};

const getElText = module.exports.getElText = (selector, el) => {
  if (el && typeof el === 'function' && typeof selector === 'string') {
    el = el(selector);
  }

  return el && el.text ? el.text() : '';
};

const getElAttr = module.exports.getElAttr = (attributeName, selector, el) => {
  if (!el && selector && typeof selector !== 'string') {
    el = selector;
  }

  if (!attributeName) {
    throw new Error('Expected an `attributeName` argument for `getMetaTag`');
  }

  if (el && typeof el === 'function' && typeof selector === 'string') {
    el = el(selector);
  }

  return el && el.attr ? el.attr(attributeName) : '';
};

const getMetaTagContentValue = module.exports.getMetaTagContentValue = (selector, el) => {
  return getElAttr('content', selector, el);
};

module.exports.getMetaTagHrefValue = (selector, el) => {
  return getElAttr('href', selector, el);
};

module.exports.getManifestFallback = (docDOM, docURL) => {
  if (!docDOM || !docDOM.html || !docDOM.html()) {
    return {};
  }

  const getElTextFromDoc = (selector, el) => {
    return getElText(selector, el || docDOM);
  };

  const getMetaTagContentValueFromDoc = (selector, el) => {
    return getMetaTagContentValue(selector, el || docDOM);
  };

  const getIconInfo = icon => {
    if (icon.href && !icon.type) {
      icon.type = mime.lookup(icon.href);
    }

    // Remove members with empty values.
    Object.keys(icon).forEach(key => {
      if (!icon[key]) {
        delete icon[key];
      }
    });
  };

  const ogSiteName = getMetaTagContentValueFromDoc('meta[property="og:site_name"]');
  const ogTitle = getMetaTagContentValueFromDoc('meta[property="og:title"]');
  const ogURL = getMetaTagContentValueFromDoc('meta[property="og:url"]');
  const ogDescription = getMetaTagContentValueFromDoc('meta[property="og:description"]');
  const ogImage = getMetaTagContentValueFromDoc('meta[property="og:image"]');
  const ogLang = getMetaTagContentValueFromDoc('meta[property="og:lang"]');

  const twitterSiteName = getMetaTagContentValueFromDoc('meta[property="twitter:site_name"]');
  const twitterAppName = getMetaTagContentValueFromDoc('meta[name="twitter:app:name"], ' +
    'meta[name="twitter:app:name:iphone"], ' +
    'meta[name="twitter:app:name:ipad"], ' +
    'meta[name="twitter:app:name:googleplay"]');
  const twitterTitle = getMetaTagContentValueFromDoc('meta[name="twitter:title"]');
  const twitterURL = getMetaTagContentValueFromDoc('meta[name="twitter:url"]');
  const twitterDescription = getMetaTagContentValueFromDoc('meta[property="og:description"]');
  const twitterImage = getMetaTagContentValueFromDoc('meta[name="twitter:image"]');

  let appleAppStatusBarStyle = getMetaTagContentValueFromDoc('meta[name="apple-mobile-web-app-status-bar-style"]');
  if (appleAppStatusBarStyle === 'default') {
    appleAppStatusBarStyle = '';
  }
  if (appleAppStatusBarStyle === '-translucent') {
    appleAppStatusBarStyle = appleAppStatusBarStyle.substr(0, appleAppStatusBarStyle.length - '-translucent'.length);
  }
  if (appleAppStatusBarStyle === 'black') {
    appleAppStatusBarStyle = '#000';
  }
  const appleAppTitle = getMetaTagContentValueFromDoc('meta[name="apple-mobile-web-app-title"]');

  const microsoftAppName = getMetaTagContentValueFromDoc('meta[name="application-name"]');

  // See http://l20n.org/ for details.
  const l20nDefaultLanguage = getMetaTagContentValue('meta[name="defaultLanguage"]');

  const appName = appleAppTitle || microsoftAppName || appleAppTitle || ogSiteName || ogTitle || twitterAppName || twitterSiteName || twitterTitle || getElTextFromDoc('title') || '';
  const appShortName = appName;
  const appDescription = getMetaTagContentValueFromDoc('meta[name="description"]') || ogDescription || twitterDescription;
  const appStartURL = getMetaTagContentValueFromDoc('link[rel="canonical"], meta[name="msapplication-starturl"], meta[name="start_url"]') || twitterURL || ogURL || docURL;
  const appThemeColor = getMetaTagContentValueFromDoc('meta[name="theme-color"], meta[name="theme_color"], meta[name="msapplication-TileColor"], meta[name="msapplication-navbutton-color"]');
  const appBackgroundColor = getMetaTagContentValueFromDoc('meta[name="background-color"], meta[name="background_color"]') || getElAttr('body[bgcolor]', docDOM, 'bgcolor');
  const appLang = getElAttr('html[lang]', 'lang') || l20nDefaultLanguage || ogLang || getElAttr('html[xml:lang]', 'xml:lang');

  let appIcon = {};
  let appIconEl;
  let appIcons = Array.prototype.map.call(docDOM('link[rel~="icon"], link[rel~="favicon"], link[rel$="-icon"]'), el => {
    appIcon = {};

    appIconEl = docDOM(el);

    if (!appIconEl) {
      return;
    }

    appIcon.href = getElAttr('href', appIconEl);
    appIcon.sizes = getElAttr('sizes', appIconEl) || getElAttr('size', appIconEl);
    appIcon.type = getElAttr('type', appIconEl);
    appIcon.density = getElAttr('density', appIconEl);
    appIcon.color = getElAttr('color', appIconEl);
    appIcon.purpose = getElAttr('purpose', appIconEl);
    appIcon.background_color = getElAttr('background_color', appIconEl) ||
      getElAttr('background-color', appIconEl) ||
      getElAttr('backgroundColor', appIconEl);
    appIcon.theme_color = getElAttr('theme_color', appIconEl) ||
      getElAttr('theme-color', appIconEl) ||
      getElAttr('themeColor', appIconEl);
    appIcon.border_radius = getElAttr('border_radius', appIconEl) ||
      getElAttr('border-radius', appIconEl) ||
      getElAttr('BorderRadius', appIconEl);

    appIcon = getIconInfo(appIcon);

    return appIcon;
  });

  if (ogImage) {
    appIcons.push(getIconInfo({
      src: ogImage
    }));
  }

  if (twitterImage) {
    appIcons.push(getIconInfo({
      src: twitterImage
    }));
  }

  let manifest = {
    name: appName,
    short_name: appShortName,
    start_url: appStartURL,
    icons: []
  };

  if (appLang) {
    manifest.lang = appLang;
  }

  if (appDescription) {
    manifest.description = appDescription;
  }

  if (appThemeColor) {
    manifest.theme_color = appThemeColor;
  }
  if (appBackgroundColor) {
    manifest.background_color = appBackgroundColor;
  }

  let appIconsInserted = {};

  appIcons.forEach(icon => {
    if (!icon || !icon.href || icon.href in appIconsInserted) {
      return;
    }

    appIconsInserted[icon.href] = true;

    manifest.icons.push(icon);
  });

  return manifest;
};
