(function () {
  function loadFonts () {
    var fonts = {
      'franklin_gothic_fsbook': {
        'woff2': 'fonts/franklingothic-book-webfont.woff2',
        'woff': 'fonts/franklingothic-book-webfont.woff'
      },
      'franklin_gothic_fsbook_italic': {
        'woff2': 'fonts/franklingothic-bookit-webfont.woff2',
        'woff': 'fonts/franklingothic-bookit-webfont.woff'
      },
      'franklin_gothic_fsdemi': {
        'woff2': 'fonts/franklingothic-demi-webfont.woff2',
        'woff': 'fonts/franklingothic-demi-webfont.woff'
      },
      'franklin_gothic_fsdemi_italic': {
        'woff2': 'fonts/franklingothic-demiit-webfont.woff2',
        'woff': 'fonts/franklingothic-demiit-webfont.woff'
      },
    };

    var fontsLoaded = Object.keys(fonts).map(function (fontName) {
      var font = fonts[fontName];
      var fontSrc = Object.keys(font).map(function (fontFormat) {
        return `url("${font[fontFormat]}") format("${fontFormat}")`;
      });
      var fontFace = new FontFace(
        fontName,
        fontSrc.join(', ')
      );
      return fontFace.load().then(function (loadedFontFace) {
        document.fonts.add(loadedFontFace);
        var fontLoadedDataAttribute = document.documentElement.getAttribute('data-font-loaded') || '';
        document.documentElement.setAttribute('data-font-loaded', (fontName + ' ' + fontLoadedDataAttribute).trim());
        console.log('Loaded font-face "%s"', fontName);
      });
    });

    Promise.all(fontsLoaded).then(function (fontFacesLoaded) {
      console.log('Loaded all fonts');
    });
  }

  loadFonts();
})();
