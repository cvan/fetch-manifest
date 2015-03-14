# fetch-manifest

Fetch [W3C web app manifests](http://w3c.github.io/manifest/).


## Features

* fetches manifests
* replaces relative URLs in the manifest with absolute ones (i.e., `start_url`, `src` keys)


## Installation

To install from npm:

    npm install fetch-manifest

To install the Node dependencies from the git repository:

    npm install


## Usage

Here's a basic example of how to use this library in your project:

```js
var manifestFetch = require('manifest-fetch');

fetchManifest('https://games.mozilla.org/gdc/').then(function (data) {
  console.log(JSON.stringify(data, null, 2));
}).catch(function (err) {
  console.error(JSON.stringify({error: err.message}, null, 2));
});
```


## Licence

[MIT Licence](LICENCE)


## Contributing

[Contributions are very welcome!](CONTRIBUTING.md)
