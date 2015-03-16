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

Generate a local settings file:

    cp settings_local.js{.dist,}


## Usage

Here's a basic example of how to use this library in your project:

```js
var manifestFetch = require('manifest-fetch');

fetchManifest.fetchManifest('https://games.mozilla.org/gdc/').then(function (data) {
  console.log(JSON.stringify(data, null, 2));
}).catch(function (err) {
  console.error(JSON.stringify({error: err.message}, null, 2));
});
```

To create an HTTP server (using [__hapi__](http://hapijs.com/)) that serves the fetched manifests:

```js
var manifestFetch = require('manifest-fetch');

fetchManifest.createServer();
```

To attach the controller routes to an existing __hapi__ server:

```js
var Hapi = require('hapi');
var manifestFetch = require('manifest-fetch');

var myServer = new Hapi.server();

fetchManifest.createServer({
  server: myServer
});
```


## Development

Serve the site from the simple server:

    npm run dev

Then launch the site from your favourite browser:

[__http://localhost:3000/__](http://localhost:3000/)

If you wish to serve the site from a different port:

    FETCH_MANIFEST_PORT=8000 npm run dev


## Deployment

In production, the server is run like so:

    NODE_ENVIRONMENT=production node index.js

Alternatively:

    npm run prod

To run the server à la Heroku:

    foreman start web


## Licence

[MIT Licence](LICENCE)


## Contributing

[Contributions are very welcome!](CONTRIBUTING.md)
