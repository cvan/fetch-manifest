var fetchManifest = require('./lib/fetchManifest');

if (!module.parent) {
  fetchManifest.createServer();
}

module.exports = fetchManifest;
