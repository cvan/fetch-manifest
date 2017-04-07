[<img src="https://raw.githubusercontent.com/cvan/fetch-manifest/master/public/img/logo.png" alt="FetchManifest" title="FetchManifest" width="200">](https://fetchmanifest.org/)

# [FetchManifest](https://fetchmanifest.org/)

A nifty tool for fetching metadata from [W3C Web-App Manifests](http://w3c.github.io/manifest/).

**[Try it out now!](https://fetchmanifest.org/)**


## Features

* fetches [web-app manifests](http://w3c.github.io/manifest/)
* replaces relative URLs in the manifest with absolute ones (i.e., `start_url`, `src` keys)
* sets [CORS](http://en.wikipedia.org/wiki/Cross-origin_resource_sharing) headers on manifest responses


## Installation

To install from npm:

```bash
npm install fetch-manifest
```

To install the Node dependencies from the git repository:

```bash
npm install
```

Generate a local settings file:

```bash
cp settings_local.js{.dist,}
```


## Usage

Here's a basic example of how to use this library in your project:

```js
var manifestFetch = require('manifest-fetch');

fetchManifest.fetchManifest('https://webvr.rocks/').then(function (data) {
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

To clone this repo:

```bash
git clone git@github.com:cvan/fetch-manifest.git
```

Serve the site from the simple server:

```bash
npm run dev
```

Then, launch the site from your favourite browser:

[__http://localhost:3000/__](http://localhost:3000/)

If you wish to serve the site from a different port:

```bash
FETCH_MANIFEST_PORT=8000 npm run dev
```


## Deployment

In production, the server is run like so:

```bash
NODE_ENV=production node ./app.js
```

Alternatively:

```bash
npm run prod
```

To run the server à la Heroku:

```bash
foreman start web
```


## Contributing

[Contributions are very welcome!](CONTRIBUTING.md)


## Licence

All code and content within this source-code repository is licensed under the [**Creative Commons Zero v1.0 Universal** license (CC0 1.0 Universal; Public Domain Dedication)](LICENSE.md).

You can copy, modify, distribute and perform this work, even for commercial purposes, all without asking permission.

For more information, refer to these following links:

* a copy of the [license](LICENSE.md) in [this source-code repository](https://github.com/webvrrocks/webvr-agent)
* the [human-readable summary](https://creativecommons.org/publicdomain/zero/1.0/) of the [full text of the legal code](https://creativecommons.org/publicdomain/zero/1.0/legalcode)
* the [full text of the legal code](https://creativecommons.org/publicdomain/zero/1.0/legalcode)
