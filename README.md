# Draft Proposal for SES (Secure EcmaScript)

**Superceded (at least in part) by a [Compartments](https://github.com/tc39/proposal-compartments) proposal.**

Note that this proposal was previously called "proposal-frozen-realms". However, with progress on [proposal-realms](https://github.com/tc39/proposal-realms), the [realms-shim](https://github.com/Agoric/realms-shim), and the [ses-shim](https://github.com/Agoric/SES), we found we no longer needed to distinguish frozen-realms from SES. Most historical references to "Frozen Realms" are best interpreted as being about an older version of SES.

Champions
  - Mark S. Miller, Agoric
  - JF Paradis, Agoric
  - Caridy Patiño, Salesforce
  - Patrick Soquet, Moddable
  - Bradley Farias, GoDaddy, Node

----

This document specifies "compartments", a concept focused on making _lightweight realms_ designed to be used with a shared _immutable realm_. The proposal here is intended to compose well with the various `Realm` proposals but is independent. These proposals each have utility without the other, and so can be proposed separately. However, together they have more power than each separately.

We motivate the SES API presented here with a variety of examples.

### Status

Current Stage:

 * __Stage 1__

### External links

[Moddable's Compartment API](https://github.com/Moddable-OpenSource/moddable/tree/public/examples/js/compartments), the direct ancestor to this proposal, implemented on the XS SES engine.

[Making Javascript Safe and Secure](https://www.youtube.com/playlist?list=PLzDw4TTug5O25J5M3fwErKImrjOrqGikj) Talks by Mark S. Miller (Agoric), Peter Hoddie (Moddable), and Dan Finlay (MetaMask)

Presentation to TC53 [Omit Needless Words](https://www.youtube.com/watch?v=aMHV7LCt8Es&list=PLzDw4TTug5O0ywHrOz4VevVTYr6Kj_KtW)

[LavaMoat - Securing your dependency graph](https://www.youtube.com/watch?v=pOTEJy_FqIA) by Kumavis (MetaMask)

Presentation to Node Security [Securing EcmaScript](https://www.youtube.com/watch?v=9Snbss_tawI&list=PLzDw4TTug5O0ywHrOz4VevVTYr6Kj_KtW)

**Historical**

[Automated Analysis of Security-Critical JavaScript APIs](https://research.google/pubs/pub37199/) by Ankur Taly Úlfar Erlingsson John C. Mitchell Mark S. Miller Jasvir Nagra

[Frozen Realms: Draft Standard Support for Safer JavaScript
Plugins](https://www.youtube.com/watch?v=tuMG7688Ndw)
is an in-depth talk that covers the important ideas, but is very stale
regarding specifics.

The [old Realms API proposal](https://gist.github.com/dherman/7568885) and the [current Realms proposal](https://github.com/tc39/proposal-realms). The original plan was to settle the Realms proposal first, but with the current approach, this is not longer required.

The original efforts to rebuild frozen realms on top of these Realms is:
   * [Realms shim](https://github.com/Agoric/realms-shim)
   * [SES shim](https://github.com/Agoric/SES)

## Summary

In ECMAScript, a _realm_ consists of a global object and an associated set of _primordial objects_ -- mutable objects like `Array.prototype` that must exist before any code runs. Objects within a realm implicitly share these primordials and can therefore easily disrupt
each other by _primordial poisoning_ -- modifying these objects to behave badly. This disruption may happen accidentally or maliciously. Today, in the browser, realms can be created via _same origin iframes_,
and in Node via `vm` contexts. On creation, these realms are separate from each other because they share no mutable state. Because prototypes are mutable, each realm needs its own set, making this separation too expensive to be used at fine grain.

Realms are currently not exposed directly to JavaScript but are represented in the specs by the _realm record_, of which the most important slots are the _intrinsics_, the _global object_, and the _global lexical environment_ (see [ECMA262 sections 8.2 Realms](https://tc39.es/ecma262/#sec-code-realms)).

We propose to add the concept of _compartments_, to designate _lightweight child realms_ inside a realm. Each compartment has its own global object and global lexical scope, but all compartments inside a given realm share their intrinsics. Separation is achieved by making the intrinsics immutable, preventing an object in one compartment
from poisoning the prototypes used by the other compartments.

This means that each compartment consists of a new _global object_, and a new _global lexical environment_:

| Record slots         | Realm          | Compartment       |
| -------------------- | -------------- | ----------------- |
| intrinsics           | mutable        | immutable, shared |
| global object        | mutable        | mutable           |
| global lexical scope | mutable        | mutable           |

The _compartment record_ is like a _realm record_, except that its _intrinsics_ slot points to the parent realm record. Everywhere the specs refers to the the realm record, the compartment record can be subsituted with no further changes.

### The Compartment constructor

We propose a `Compartment` class, whose instances is a reification of the concept of "compartment" introduced above, for making multiple _lightweight child realms_ inside a given realm.

Though initially separate, compartments can be brought into intimate contact with each other via global object and modules.

```js
class Compartment {
  constructor: (
    endowments: object?,     // extra bindings added to the global object
    moduleMap: object?,      // maps child specifier to parent specifier
    options: object?         // including hooks like isDirectEvalHook
  ) -> object                // an exotic compartment object

  get global -> object       // access this compartment's global object

  evaluate(                  // do a strict indirect eval in this compartment
    src: stringable,
    options: object?         // per-evaluation rather than per-compartment
  ) -> any

  // same signature as dynamic import
  async import(specifier: string) -> promise<ModuleNamespace>
  importSync(specifier: string) -> ModuleNamespace
}
```

The compartment constructor creates a new lightweight child realm with a new `global`, a new `eval` function, a new `Function` constructor, and a new `Compartment` constructor.

- The compartment global object consists of all the primordial state defined by
ECMA262, but contains no host provided objects, so `window`, `document`, `XMLHttpRequest`,
`require`, `process` etc. are all absent. Thus, a compartment contains none of the objects needed for interacting with the outside world, like the user or the network.

- The new `eval`, `Function`, and `Compartment` will evaluate code in the global scope of the new compartment: the new compartment's `global` becomes their global object.

- The new `eval`, `Function`, and `Compartment` inherit from the shared %FunctionPrototype%.

- The new `Function.prototype` is the shared %FunctionPrototype%.

- The new `Compartment` constructor...?

- The new `Compartment.prototype` is the shared %CompartmentPrototype%.

The constructor then copies the values of the own enumerable properties from the `endowments` parameter onto the new `global` and returns the new compartment instance. With these additional endowments, users provide the
*virtual host objects* that they wish to be available in the spawned compartment.

The Compartment constructor is only available on the global object after lockdown has been invoked (see below).

### The Compartment prototype

We propose on the shared `Compartment.prototype`, to be inherited by instances of the all Compartment classes:
- a `global` getter to provide access to the compartment global object. Its behavior is similar to the `globalThis` global object.
- an `evaluate` method to evaluate code in the global scope of the new compartment. Its signature is identical to the `eval()` function
  but possibly with an additional optional options argument.
- an asynchronous `import` method to dynamically load modules in the new compartment. Its signature is identical to the
  dynamic import function.

### The `lockdown` method

We propose a static method, `lockdown()` or `Realm.lockdown()`, for converting the current realm into a state with immutable primordials. We call such a realm an _immutable realm_. The `Realm` global object will be specified by the Realms proposal.

The lockdown operation consists of:
- taming some globals (see below).
- taming the function constructors (see below).
- freezing all intrinsics (see below).
- disabling the default mechanism causing the _override mistake_ (see below).
- exposing the `Compartment` constructor via the global object which is not available before lockdown (see below).

Although `Compartment` and `Realm.lockdown()` appear orthogonal, they are only interesting when directly composed:

```js
Realm.lockdown();
const cmpA = new Compartment();
const cmpB = new Compartment();
```

After lockdown, all the primordials that `cmpA` and `cmpB` share are immutable, so neither can poison the prototypes of the other. Because they share no mutable state, they are as fully separate from each other as two full realms created by two same origin iframes
(except the shared identity of frozen primordials, thus avoiding identity discontinuity explained below).

Modification of the prototypes is allowed before lockdown is called
(which raises interesting issues re what is frozen by lockdown).

(edit with next two paragraphs)

A long recognized best practice is "don't monkey-patch primordials" -- don't mutate any primordial state. Most legacy code obeying this practice is already compatible with lightweight realms descending from an immutable root realm. Some further qualifications are explained in the rest of this document.

If customization of the intrinsics is required, it can be done before lockdown is called and before any compartment is created.


## The Compartment global object

The compartment constructor is unavailable before `lockdown()` is called, to avoid the risk of omitting lockdown and creating compartments with non-frozen primordials (which would not provide the intended isolation).

## Freezing intrinsics and Taming globals

In order for the intrinsics to be shared safely, they must be transitively immutable. Fortunately, of the standard primordials in ES2016, the only mutable primordial state is:
  * Mutable own properties of primordial objects
  * The mutable internal [[Prototype]] slot of primordial objects
  * The ability to add properties
  * `Math.random`
  * `Date.now`
  * The `Date` constructor called as a constructor with no arguments
  * The `Date` constructor called as a function, no matter what arguments
    (Surprised me!)
  * Normative optional proposed `RegExp` static methods (link)
  * Normative optional proposed `Error.prototype.stack` accessor (link)

To make a transitively immutable root realm, we, respectively
  * Remove all non-standard properties
  * Remove `Math.random`
  * Remove `Date.now`
  * Have `new Date()` throw a `TypeError`
  * Have `Date(any...)` throw a `TypeError`
  * Remove the `RegExp` static methods if present
  * Remove `RegExp.prototype.compile`
  * Remove `Error.prototype.stack` if present
  * Make all primordial objects non-extensible.
  * Make all remaining properties non-configurable, non-writable. If an
    accessor property, we specify that its getter must always return
    the same value
    without mutating any state, and its setter either be absent or throw an error
    without mutating any state.

Likewise, any new addition to the specifications need to follow the same policy, in order to avoid introducing mutable state in a compartment.

A user can effectively add the missing functionality of `Date` and `Math` back in when necessary, or substitute safe implementations. For example

```js
const DateNow = Date.now;

Realm.lockdown();

function unsafeDate() {
  return Date(...arguments);
}
Object.defineProperties(unsafeDate, Object.getOwnPropertyDescriptors(Date));
Object.defineProperty(unsafeDate, 'now', {
	value: DateNow,
	writable: true,
	enumerable: false,
	configurable: true
});

const cmp = new Compartment({ Date: unsafeDate });
```

## Taming the function constructors.

All intrinsics are shared, but the %Function%, %GeneratorFunction%, %AsyncFunction% and %AsyncGeneratorFunction% perform by default source code evaluation in the global scope of the realm.

After lockdown, these constructor should be replaced with functions that throw instead of evaluating source code, so they can be safely shared.
We could specify that their throwing behavior is the same as when the host hook (for CSP) suppresses evaluation, mapping it to an already possible behavior.
If `Compartment` is a per-realm global rather than per-Compartment, then
`Compartment.prototype.constructor === Compartment`, which is not tamed? Let's talk about this.

## Override mistake

Because of lack of sufficient foresight at the time, ES5 unfortunately specified that a simple assignment to a non-existent property must fail if it would override a non-writable data property of the same name. (In retrospect, this was a mistake, but it is now too late and we must live with the consequences.) It is inconsistent with overriding by classes and object literals, since they do `[[DefineOwnProperty]]` rather than assignment.

As a result, simply freezing an object to make it immutable has the unfortunate side effect of breaking previously correct code that is considered to have followed JS best practices, if this previous code used assignment to override. For example this assignment will fail:

```js
Object.freeze(Array.prototype);
const arr = []
arr.join = true; // throws in strict mode, ignore in sloppy mode.
```

For that reason, after freezing the primordials, we need to [Make non-writable prototype properties not prevent assigning to instance](https://github.com/tc39/ecma262/pull/1320).

See the [override mistake](https://web.archive.org/web/20141230041441/http://wiki.ecmascript.org/doku.php?id=strawman:fixing_override_mistake). (better link?)

(We need another bit of semantic state to distinguish these two ways of being frozen. We should specify that `petrify` and perhaps even `harden` also protect against override mistake, even though we avoid fully shimming that.)

## Identity discontinuity

Two realms, made by same origin iframes or vm contexts, can be put in contact. Once in contact, they can mix their object graphs freely. When realms do this, they encounter an inconvenience and source of bugs we will here call _identity discontinuity_. For example if code from iframeA makes an array `arr` that it passes to code from iframeB, and iframeB tests `arr instanceof Array`, the answer will be `false` since `arr` inherits from the `Array.prototype` of iframeA which is a different object than the `Array.prototype` of iframeB.

By contrast, since `cmpA` and `cmpB` share the same `Array.prototype`, an array `arr` created by one still passes the `arr instanceof Array` as tested by the other.


###################################
# TODO BELOW


## Confinement examples

```js
function confine(src, endowments) {
  return sharedRoot.spawn(endowments).eval(src);
}
```

This `confine` function is an example of a security abstraction we can
easily build by composing the primitives above. It uses `spawn` to
make a lightweight realm descendant from our immutable `sharedRoot`
realm above, copies the own enumerable properties of `endowments` onto
the global of that lightweight realm, and then evaluates `src` in the
scope of that global and returns the result. This `confine` function is
especially useful for
[_object-capability_ programming](https://en.wikipedia.org/wiki/Object-capability_model). These
primitives (together with membranes) can also help to support other
security models such as
_[decentralized dynamic information flow](https://slang.soe.ucsc.edu/cormac/proxy.pdf)_
though more mechanism may additionally be needed. We have not yet
explored this in any detail.

(The `confine` function is from SES, which has a
[formal semantics](http://research.google.com/pubs/pub37199.html)
supporting automated verification of some security properties of SES
code.  It was developed as part of the Google
[Caja](https://github.com/google/caja) project; you can read more
about SES and Caja on the Caja website.)


```js
confine('x + y', {x: 3, y: 4})  // -> 7

confine('Object', {})           // -> Object constructor of an immutable root

confine('window', {})           // ReferenceError, no 'window' in scope
```

## Plugin separation example


```js
function Counter() {
  let count = 0;
  return Object.freeze({
    incr: Object.freeze(() => ++count),
    decr: Object.freeze(() => --count)
  });
}
const counter = new Counter();

// ...obtain billSrc and joanSrc from untrusted clients...
const bill = confine(billSrc, {change: counter.incr});
const joan = confine(joanSrc, {change: counter.decr});
```

Say the code above is executed by a program we call Alice. Within this
code, Alice obtains source code for plugins Bill and Joan. Alice does
not know how well these plugins are written, and so wishes to protect
herself from their misbehavior, as well as protect each of them from
the misbehavior of the other. It does not matter whether Alice is
worried about accidental or malicious misbehavior.

With the code above, Alice presents to each of these plugins an API
surface of her design, characteristic of the plugin framework she
defines. In this trivial example, she provides to each a function they
will know as `change` for manipulating the state of a shared
counter. By calling his `change` variable, Bill can only increment the
counter and see the result. By calling her `change` variable, Joan can
only decrement the counter and see the result. By using her `counter`
variable Alice can do both.

If Alice's code above is normal JavaScript code, then she does not achieve this
goal. For example, Bill or Joan could use the expression `change.__proto__` to
access and poison Alice's prototypes, and to interact with each other in ways
Alice did not intend to enable. The API surface that Alice exposed to Bill and
Joan was not _defensive_; it did not protect itself and Alice from Bill and
Joan's misbehavior.

Alice's code above is properly defensive if it is evaluated in a realm
descendant from an immutable root realm. Alice places Bill and Joan in
such a realm to confine them. She places herself in such a realm for
its _defensibility_, which Alice can use to define defensive
abstractions that are safe to expose to Bill and Joan. If Alice, Bill,
and Joan all descend from `sharedRoot`, then their further
interactions are defensible and free of identity discontinuities.


## A convenience: `def(obj)`

All those calls to `Object.freeze` above are ugly. The [Caja
`def(obj)`](https://github.com/google/caja/blob/master/src/com/google/caja/ses/startSES.js#L1180)
function is an example of a convenience that should be provided by a
library. It applies `Object.freeze` recursively to all objects it finds
starting at `obj` by following property and `[[Prototype]]` links. This gives
all these objects a tamper proof API surface (Note, though, that it *does not*
make them immutable except in special cases.) The name `def` means "_define_ a
_defensible_ object".

Using `def`, we can rewrite our Counter example code as

```js
function Counter() {
  let count = 0;
  return def({
    incr() { return ++count; }
    decr() { return --count; }
  });
}
```

To be efficient, `def` needs to somehow be in bed with this
proposal, so it can know to stop traversing when it hits any of these
transitively immutable primordials. We leave it to a later proposal to
work out this integration issue.


## Compartments example

By composing
[revocable membranes](http://soft.vub.ac.be/~tvcutsem/invokedynamic/js-membranes)
and `confine`, we can make compartments:

```js
function makeCompartment(src, endowments) {
  const {wrapper,
         revoke} = makeMembrane(confine);
  return {wrapper: wrapper(src, endowments),
          revoke};
}

// ...obtain billSrc and joanSrc from untrusted clients...
const {wrapper: bill,
       revoke: killBill} = makeCompartment(billSrc, endowments);
const {wrapper: joan,
       revoke: killJoan} = makeCompartment(joanSrc, endowments);

// ... introduce mutually suspicious Bill and Joan to each other...
// ... use both ...
killBill();
// ... Bill is inaccessible to us and to Joan. GC can collect Bill ...
```

After `killBill` is called, there is nothing the Bill code can do to
cause further effects.


## Detailed Proposal

You can view the spec text draft in [ecmarkup](spec/index.emu) format or rendered as [HTML](https://rawgit.com/tc39/frozen-realms/master/index.html).

  1. Introduce the `Realm` class as an officially recognized part of the
     ECMAScript standard API.

  1. Add to the `Realm` class a static method, `Realm.immutableRoot()`,
     which obtains an _immutable root realm_ in which all primordials
     are already transitively immutable. These primordials include
     *all* the primordials defined as mandatory in ES2016. (And those
     in [draft ES2017](https://tc39.github.io/ecma262/) as of March
     17, 2016, the time of this writing.)  These primordials must
     include no other objects or properties beyond those specified
     here. In an immutable root realm the global object itself is also
     transitively immutable. Specifically, it contains no
     host-specific objects. This frozen global object is a plain
     object whose `[[Prototype]]` is `Object.prototype`, i.e., the
     `%ObjectPrototype%` intrinsic of that immutable root realm.

     * Since two immutable root realms are forever the same in all
       ways except object identity, we leave it implementation-defined
       whether `Realm.immutableRoot()` always creates a fresh one, or
       always returns the same one. On any given implementation, it
       must either be always fresh or always the same.

  1. In order to attain the necessary deep immutability of an
     immutable root realm, two of its primordials must be modified
     from the existing standard: An immutable root realm's `Date`
     object has its `now()` method removed and its default constructor
     changed to throw a `TypeError` rather than reveal the current
     time.  An immutable root realm's `Math` object has its `random()`
     method removed.

  1. Add to the `Realm` class an instance method, `spawn(endowments)`.
     1. `spawn` creates a new lightweight child realm with its own
        fresh global object (denoted below by the symbol
        `freshGlobal`) whose `[[Prototype]]` is the parent realm's
        global object. This fresh global is also a plain
        object. Unlike the global of an immutable root realm, this new
        `freshGlobal` is _not_ frozen by default.

     1. `spawn` populates this `freshGlobal` with overriding
        bindings for the evaluators that have global names (currently
        only `eval` and `Function`). It binds each of these names to
        fresh objects whose `[[Prototype]]`s are the corresponding
        objects from the parent realm.

     1. `spawn` copies the own enumerable properties from the
        `endowments` record onto the `freshGlobal`.

     1. `spawn` returns that new child realm instance.

     The total cost of a lightweight realm is four objects: the realm
     instance itself, the `freshGlobal`, and the `eval` function and
     `Function` constructor specific to it.

  1. The evaluators of a spawned realm evaluate code in the global
     scope of that realm's global, using that
     global as their global object.

     A lightweight realm's initial `eval` inherits from its parent's
     `eval`. For each of the overriding constructors (currently only
     `Function`), its `prototype` property initially has the same
     value as the constructor they inherit from. Thus, a function
     `foo` from one descendant realm passes the `foo instanceof
     Function` test using the `Function` constructor of another
     descendant of the same parent realm. Among sibling lightweight
     realms, `instanceof` on primordial types simply works.



### Polyfill example

In the **Punchlines** section below, we explain the non-overt channel
threats that motivate the removal of `Date.now` and
`Math.random`. However, usually this threat is not of interest, in
which case we'd rather include the full API of ES2016, since it is
otherwise safe. Indeed, Caja has always provided the full
functionality of `Date` and `Math` because Caja's threat model did not
demand that they be denied.

The following `makeColdRealm(GoodDate, goodRandom)` function, given a
good `Date` constructor and `Math.random` function, makes a new
frozen-enough lightweight realm, that can be used as if it is an
immutable root realm -- as a spawning root for making lightweight
child realms. These children are separated-enough from each other,
if one is not worried about non-overt channels. Unlike the lightweight
realms directly descendant from an immutable root realm, children
spawned from a common cold realm share a fully functional `Date` and
`Math`.


```js
function makeColdRealm(GoodDate, goodRandom) {
  const goodNow = GoodDate.now;
  const {Date: SharedDate, Math: SharedMath} = sharedRoot;
  function FreshDate(...args) {
    if (new.target) {
      if (args.length === 0) {
        args = [+goodNow()];
      }
      return Reflect.construct(SharedDate, args, new.target);
    } else {
      return String(GoodDate());
    }
  }
  FreshDate.now = () => +goodNow();
  FreshDate.prototype = SharedDate.prototype;  // so instanceof works
  FreshDate.name = SharedDate.name;
  FreshDate.__proto__ = SharedDate;

  const FreshMath = {
    __proto__: SharedMath,
    random() { return +goodRandom(); }
  };

  return def(sharedRoot.spawn({Date: FreshDate, Math: FreshMath}));
}
```

In addition to `Date` and `Math`, we can create abstractions to endow
a fresh global with virtualized emulations of expected host-provided
globals like `window`, `document`, or `XMLHttpRequest`. These
emulations may map into the caller's own or
not. [Caja's Domado library](https://github.com/google/caja/blob/master/src/com/google/caja/plugin/domado.js)
uses exactly this technique to emulate most of the conventional
browser and DOM APIs, by mapping the confined code's virtual DOM into
the portions of the caller's "physical" DOM that the caller
specifies. In this sense, the confined code is like user-mode code in
an operating system, whose virtual memory accesses are mapped to
physical memory by a mapping it does not see or control. Domado remaps
URI space in a similar manner. By emulating the browser API, much
existing browser code runs compatibly in a virtualized browser
environment as configured by the caller using Domado.

Because `eval`, `Function`, and the above `Date` and `Math` observably
shadow the corresponding objects from their parent realm, the spawned
environment is not a fully faithful emulation of standard
ECMAScript. However, these breaks in the illusion are a necessary
price of avoiding identity discontinuities between lightweight realms
spawned from a common parent. We have chosen these breaks carefully to
be compatible with virtually all code not written specifically to test
standards conformance.


### Mobile code example

Map-Reduce frameworks vividly demonstrate the power of sending the
code to the data, rather than the data to the code. Flexible
distributed computing systems must be able to express both.

Now that `Function.prototype.toString` will give a
[reliably evaluable string](http://tc39.github.io/Function-prototype-toString-revision/)
that can be sent, an immutable root realm provides a safe way for the
receiver to evaluate it, in order to reconstitute that function's call
behavior in a safe manner. Say we have a `RemotePromise` constructor
that makes a
[remote promise for an object that is elsewhere](https://github.com/kriskowal/q-connection),
potentially on another machine. Below, assume that the `RemotePromise`
constructor initializes this remote promise's
[private instance variable](https://zenparsing.github.io/es-private-fields/)
`#farEval` to be another remote promise, for the `eval` method of an
immutable root realm at the location (vat, worker, agent, event loop,
place, ...) where this promise's fulfillment will be. If this promise
rejects, then its `#farEval` promise likewise rejects.

```js
class QPromise extends Promise {
  // ... API from https://github.com/kriskowal/q/wiki/API-Reference
  // All we actually use below is fcall
}

// See https://github.com/kriskowal/q-connection
class RemotePromise extends QPromise {
  ...
  // callback must be a closed function, i.e., one whose only free
  // variables are the globals defined by ES2016 and therefore present
  // on the proto-global.
  there(callback, errback = void 0) {
    const callbackSrc = Function.prototype.toString.call(callback);
    const farCallback = #farEval.fcall(callbackSrc);
    return farCallback.fcall(this).catch(errback);
  }
}
```

We explain `there` by analogy. The familiar expression
`Promise.resolve(p).then(callback)` postpones the `callback` function
to some future time after the promise `p` has been fulfilled. In like
manner, the expression `RemotePromise.resolve(r).there(callback)`
postpones and migrates the closed `callback` function to some future
time and space, where the object that will be designated by the
fulfilled remote promise `r` is located. Both `then` and `there`
return a promise for what `callback` or `errback` will return.

This supports a federated form of the
[Asynchronous Partitioned Global Address Space](http://citeseerx.ist.psu.edu/viewdoc/summary?doi=10.1.1.464.557)
concurrency model used by the X10 supercomputer language, integrated
smoothly with our promise framework for handling asynchrony.


## How Deterministic?

_We do not include any form of replay within the goals of this
proposal, so this "How Deterministic" section is only important
because of the punchlines at the end of this section._

Given a deterministic spec, one could be sure that two computations,
run on two conforming implementations, starting from the same state
and fed the same inputs, will compute the same new states and
outputs. The ES5 and ES2015 specs come tantalizingly close to being
deterministic. ECMAScript has avoided some common but unnecessary
sources of non-determinism like Java's `System.identityHashCode` or
the enumeration order of identity hash tables. But the ECMAScript
specs fail for three reasons:

  * Genuine non-determinism, such as by `Math.random()`.
  * Unspecified but unavoidable failure, such as out-of-memory.
  * Explicit underspecification, i.e. leaving some observable behavior
    up to the implementation.

The explicitly non-deterministic abilities to sense the current time
(via `new Date()` and `Date.now()`) or generate random numbers (via
`Math.random()`) are disabled in an immutable root realm, and
therefore by default in each realm spawned from it. New sources of
non-determinism, like `makeWeakRef` and `getStack` will not be added
to immutable root realms or will be similarly disabled.

The ECMAScript specs to date have never admitted the possibility of
failures such as out-of-memory. In theory this means that a conforming
ECMAScript implementation requires an infinite memory
machine. Unfortunately, such machines are currently difficult to obtain. Since
ECMAScript is an implicitly-allocating language, the out-of-memory
condition could cause computation to fail at any time. If these
failures are reported by
[unpredictably throwing a catchable exception](https://docs.oracle.com/javase/8/docs/api/java/lang/VirtualMachineError.html),
then defensive programming becomes impossible. This would be contrary
to the goals
[of much ECMAScript code](https://github.com/tc39/ecmascript_sharedmem/issues/55). Thus,
any ECMAScript computation that wishes to defend its invariants, and
any synchronous computation it is entangled with must, on encountering an
unpredictable error,
[preemptively abort without running further user code](https://github.com/tc39/ecmascript_sharedmem/issues/55).

Even if ECMAScript were otherwise deterministically replayable, these
unpredictable preemptive failures would prevent it. We examine instead
the weaker property of *fail-stop determinism*, where each replica
either fails, or succeeds in a manner identical to every other
non-failing replica.

Although few in number, there _are_ specification
issues that are observably left to implementations, upon which
implementations may differ. Some of these may eventually be closed by
future TC39 agreement, such as enumeration order if objects are
modified during enumeration (TODO link). Others, like the sort
algorithm used by `Array.prototype.sort` are less likely to be
closed. However, *implementation-defined* is not necessarily genuine
non-determinism. On a given implementation, operations which are only
implementation-defined can be deterministic within the scope of that
implementation. They should be fail-stop reproducible when run on the
same implementation. To make use of this for replay, however, we would
need to pin down what we mean by "same implementation", which seems
slippery and difficult.

### The punchlines

Even without pinning down the precise meaning of
"implementation-defined", a computation that is limited to fail-stop
implementation-defined determinism _**cannot read covert channels and
side channels**_ that it was not explicitly enabled to read. Nothing
can practically prevent signaling on covert channels and side
channels, but approximations to determinism can practically prevent
confined computations from perceiving these signals.

(TODO explain the anthropic side channel and how it differs from an
information-flow termination channel.)

Fail-stop implementation-defined determinism is a **great boon to
testing and debugging**. All non-deterministic _dependencies_, like
the allegedly current time, can be mocked and _injected_ in a
reproducible manner.


## Annex B considerations

As of ES2016, the normative optionals of
[Annex B](http://www.ecma-international.org/ecma-262/6.0/#sec-additional-ecmascript-features-for-web-browsers)
are safe for inclusion as normative optionals of immutable root
realms. However, where Annex B states that these are normative
mandatory in a web browser, there is no such requirement for immutable
root realms. Even when run in a web browser, an immutable root realm,
having no host specific globals, must be considered a non-browser
environment. Some post-ES2015 APIs proposed for Annex B, such as the
[`RegExp` statics](https://github.com/claudepache/es-regexp-legacy-static-properties)
and the
[`Error.prototype.stack` accessor property](https://mail.mozilla.org/pipermail/es-discuss/2016-February/045579.html),
are not safe for inclusion in immutable root realms and must be absent.

At this time, to maximize compatibility with normal ECMAScript, we do
not alter an immutable root realm's evaluators to evaluate code in
strict mode by default. However, we should consider doing so. Most of
the code, including legacy code, that one would wish to run under an
immutable root realm is probably already compatible with strict
mode. Omitting sloppy mode from immutable root realms and their
spawned descendants would also make sections
[B.1.1](http://www.ecma-international.org/ecma-262/6.0/#sec-additional-syntax-numeric-literals),
[B.1.2](http://www.ecma-international.org/ecma-262/6.0/#sec-additional-syntax-string-literals),
[B.3.2](http://www.ecma-international.org/ecma-262/6.0/#sec-labelled-function-declarations),
[B.3.3](http://www.ecma-international.org/ecma-262/6.0/#sec-block-level-function-declarations-web-legacy-compatibility-semantics),
and
[B.3.4](http://www.ecma-international.org/ecma-262/6.0/#sec-functiondeclarations-in-ifstatement-statement-clauses)
non issues. It is unclear what an immutable root realm's evaluators
should specify regarding the remaining normative optional syntax in
section B.1. But the syntax accepted by these evaluators, at least in
strict mode, should probably be pinned down precisely by the spec.

Some of the elements of Annex B are safe and likely mandatory in
practice, independent of host environment:

  * `escape` and `unescape`
  * `Object.prototype.__proto__`
  * `String.prototype.substr`
  * The `String.prototype` methods defined in terms of the internal
    `CreateHTML`: `anchor`, `big`, ..., `sup`
  * `Date.prototype.getYear` and `Date.prototype.setYear`
  * `Date.prototype.toGMTString`
  * [`__proto__` Property Names in Object
     Initializers](http://www.ecma-international.org/ecma-262/6.0/#sec-__proto__-property-names-in-object-initializers)

All but the last of these have been
[whitelisted in Caja's SES-shim](https://github.com/google/caja/blob/master/src/com/google/caja/ses/whitelist.js#L85)
for a long time without problem. (The last bullet above is syntax and
so not subject to the SES-shim whitelisting mechanism.)


## Discussion

Because an immutable root realm is transitively immutable, we can
safely share it between ECMAScript programs that are otherwise fully
isolated. This sharing gives them access to shared objects and shared
identities, but no ability to communicate with each other or to affect
any state outside themselves. We can even share immutable root realms
between origins and between threads, since deep immutability at the
specification level should make thread safety at the implementation
level straightforward.

Today, to self-host builtins by writing them in ECMAScript, one must
practice
[safe meta programming](http://wiki.ecmascript.org/doku.php?id=conventions:safe_meta_programming)
techniques so that these builtins are properly defensive. This
technique is difficult to get right, especially if such self hosting
is
[opened to ECMAScript embedders](https://docs.google.com/document/d/1AT5-T0aHGp7Lt29vPWFr2-qG8r3l9CByyvKwEuA8Ec0/edit#heading=h.ma18njbt74u3). Instead,
these builtins could be defined in a lightweight realm spawned from an
immutable root realm, making defensiveness easier to achieve with
higher confidence.


By the rules above, a spawned realm's `Function.prototype.constructor`
will be the parent realm's `Function` constructor, i.e., identical to
the spawned realm's `Function.__proto__`. In exchange for this odd
topology, we obtain the pleasant property that `instanceof` works
transparently between spawned realms by default -- unless overridden
by a user's polyfill to the contrary.

In ES2016, the `GeneratorFunction` evaluator is not a named global,
but rather an unnamed intrinsic. Upcoming evaluators are likely to
include `AsyncFunction` and `AsyncGeneratorFunction`. These are likely
to be specified as unnamed intrinsics as well. For all of these, the
above name-based overriding of `spawn` is irrelevant and probably not
needed anyway.

Because code evaluated within an immutable root realm is unable to cause any
affects outside itself it is not given explicit access to, the
evaluators of an immutable root realm should continue to operate even in
environments in which
[CSP has forbidden normal evaluators](https://github.com/tc39/ecma262/issues/450). By
analogy, CSP evaluator suppression does not suppress
`JSON.parse`. There are few ways in which evaluating code in
an immutable root realm is more dangerous than JSON data.

Other possible proposals, like
[private state](https://zenparsing.github.io/es-private-fields/) and
[defensible `const` classes](http://wiki.ecmascript.org/doku.php?id=harmony:classes#const),
are likely to aid the defensive programming that is especially
powerful in the context of this proposal. But because the utility of
such defensive programming support is not limited to frozen realms,
they should remain independent proposals.

For each of the upcoming proposed standard APIs that are inherently
not immutable and powerless:

  * [`defaultLoader`](https://github.com/whatwg/loader/issues/34)
  * [`global`](https://github.com/tc39/proposal-global)
  * [`makeWeakRef`](https://github.com/tc39/proposal-weakrefs/blob/master/specs/weakrefs.md)
  * [`getStack`](https://mail.mozilla.org/pipermail/es-discuss/2016-February/045579.html)
  * [`getStackString`](https://mail.mozilla.org/pipermail/es-discuss/2016-February/045579.html)

they must be absent from an immutable root realm, or have their
behavior grossly truncated into something safe. This spec will
additionally need to say how they initially appear, if at all, in each
individual spawned lightweight realm.  In particular, we expect a
pattern to emerge for creating a fresh loader instance to be the
default loader of a fresh spawned realm. Once some proposed APIs are
specced as being provided by import from
[builtin primordial modules](https://github.com/tc39/ecma262/issues/395),
we will need to explain how they appear in an immutable root realm
and/or the realms it spawns.


## Open Questions

* Should `Realm.immutableRoot()` return a new fresh frozen realm each
  time or should it always return the same one? Above we leave this
  implementation-defined for now to encourage implementations to
  experiment and see how efficient each can be made. If all can agree
  on one of these options, we should codify that rather than continue
  to leave this implementation-defined.

* Although not officially a question within the jurisdiction of TC39,
  we should discuss whether the existing CSP "no script evaluation"
  settings should exempt an immutable root realm's evaluators, or whether CSP
  should be extended in order to express this differential
  prohibition.

* Currently, if the value of `eval` is anything other than the
  original value of `eval`, any use of it in the form of a direct-eval
  expression will actually have the semantics of an indirect eval,
  i.e., a simple function call to the current value of `eval`. If
  an immutable root realm's builtin evaluators are not strict by default,
  then any user customization that replaces a spawned realm's global
  evaluators with strict-by-default wrappers will break their use for
  direct-eval. Fortunately, this seems to be addressed by the rest of
  the [old Realms API](https://gist.github.com/dherman/7568885).

* The standard `Date` constructor reveals the current time either
  * when called as a constructor with no arguments, or
  * when called as a function (regardless of the arguments)

  Above we propose to censor the current time by having the proto-Date
  constructor throw a `TypeError` in those cases. Would another error type be
  more appropriate? Instead of throwing an Error, should `new Date()` produce
  an invalid date, equivalent to that produced by `new Date(NaN)`? If so,
  calling the `Date` constructor as a function should produce the corresponding
  string `"Invalid Date"`. If we go in this direction, conceivably we could
  even have `Date.now()` return `NaN`. The advantage of removing `Date.now`
  instead is to support the feature-testing style practiced by ECMAScript
  programmers.

* Of course, there is the perpetual bikeshedding of names. We are not
  attached to the names we present here.

## Spec Text

### Updating the spec text for this proposal

The source for the spec text is located in [spec/index.emu](spec/index.emu) and it is written in [ecmarkup](https://github.com/bterlson/ecmarkup) language.

When modifying the spec text, you should be able to build the HTML version in `index.html` by using the following command:

```bash
npm install
npm run build
open index.html
```

Alternative, you can use `npm run watch`.

## Acknowledgements

The Compartment API proposed here derives directly from [Moddable's earlier Compartment API](https://github.com/Moddable-OpenSource/moddable/tree/public/examples/js/compartments), in the XS implementation of standalone SES. We thank in particular Patrick Soquet and Peter Hoddlie for repeated sessions of brainstorming and refinement.

Thanks to the regular attendees at the recent SES meetings, especially Bradley Farias, Michael Fig, Saleh Motaal, and Chip Morningstar.

Many thanks to E. Dean Tribble, Kevin Reid, Dave Herman, Michael Ficarra, Tom Van Cutsem, Kris Kowal, Kevin Smith, Terry Hayes, Daniel Ehrenberg, Ojan Vafai, Elliott Sprehn, and Alex Russell. Thanks to the entire Caja team (Jasvir Nagra, Ihab Awad, Mike Stay, Mike Samuel, Felix Lee, Kevin Reid, and Ben Laurie) for building a system in which all the hardest issues have already been worked out.
