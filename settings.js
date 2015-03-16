module.exports = {
  HOST: process.env.FETCH_MANIFEST_HOST || process.env.HOST || '0.0.0.0',
  PORT: process.env.FETCH_MANIFEST_PORT || process.env.PORT || 3000,
  CORS: true,
};


var settings_path = (process.env.FETCH_MANIFEST_SETTINGS ||
                     process.env.SETTINGS ||
                     './settings_local');

if (settings_path[0] !== '/' &&
    settings_path.substr(0, 2) !== './' &&
    settings_path.substr(0, 2) !== '..') {

  // Assume it's a relative path.
  settings_path = './' + settings_path;
}


var settings_local;

try {
  settings_local = require(settings_path);
} catch (e) {
}

if (settings_local) {
  console.log('Using settings file ' + settings_path);
  Object.keys(settings_local).forEach(function (k) {
    module.exports[k] = settings_local[k];
  });
}
