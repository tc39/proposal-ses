# Frozen Realm shim [![License][license-image]][license-url] [![Build Status][travis-svg]][travis-url]

***TODO: The text below is from the [Realms shim](https://github.com/tc39/proposal-frozen-realms/tree/master/shim) and needs to be updated to describe the Frozen Realms shim.***


This folder contains a shim implementation of the Realm API specified in this repo.

## Limitations

The current implementation has 3 main limitations:

* All code evaluated inside a Realm runs in strict mode.
* Direct eval is not supported.
* `let`, global function declarations and any other feature that relies on new bindings in global contour are not preserved between difference invocations of eval, instead we create a new contour everytime.

## Building the Shim

```bash
git clone https://github.com/tc39/proposal-realms.git
cd proposal-realms
npm install
npm run build-shim
```

This will install the necessary dependencies and build the shim locally.

## Playground

To open the playground example in your default browser.

```bash
open shim/examples/frozen.html
```

## Usage

To use the shim in a webpage:
```html
  <script src="../dist/realm-shim.min.js"></script>
  <script>
    const r = new Realm();
    [...]
  </script>
```

To use the shim with node:
```js
  const Realm = require('./realm-shim.min.js');
  const r = new Realm();
  [...]
```

To can also use es6 modules on node via package `esm`. To do that, launch node with esm via the "require" option:

```bash
npm install esm
node -r esm main.js
```

And import the realm module in your code:

```js
  import Realm from './shim/src/realm';
  const r = new Realm();
  [...]
```

## Examples

### Example 1: Frozen realm

To create a frozen realm:

```js
const r = new Realm(); // root realm
r.freeze();
'use strict'; // disable silent errors
r.evaluate('[].__proto__.slice = function(){}'); // TypeError: Cannot assign to read only property 'parse'
```

### Example 2: Frozen realm from current Realm (careful)

To create a frozen realm compartment from the current execution context (which will also become frozen):

```js
const r = new Realm({ intrinsics: 'inherit' }); // realm compartment
r.freeze()
'use strict'; // disable silent errors
[].__proto__.slice = function(){}; // TypeError: Cannot assign to read only property 'slice'
```

[travis-svg]: https://travis-ci.com/tc39/proposal-frozen-realms.svg?branch=master
[travis-url]: https://travis-ci.com/tc39/proposal-frozen-realms
[license-image]: https://img.shields.io/badge/License-Apache%202.0-blue.svg
[license-url]: LICENSE

