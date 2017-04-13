const mimeDb = require('./mime_db.json');

const lookup = ext => {
  // Import purposely here to avoid a circular import.
  const getExtName = require('./utils.js').getExtName;

  ext = getExtName(ext);

  let match = '';
  let mimesDbKeys = Object.keys(mimeDb);
  let mimesDbKeysLength = mimesDbKeys.length;
  let mimeType;

  for (let idx = 0; idx < mimesDbKeysLength; idx++) {
    mimeType = mimeDb[mimesDbKeys[idx]];
    if (mimeType &&
        mimeType.extensions &&
        mimeType.extensions.indexOf(ext) > -1) {
      match = mimesDbKeys[idx];
      break;
    }
  }
  return match;
};

module.exports = {
  lookup: lookup
};
