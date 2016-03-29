# Draft Proposed Frozen Realm API

This document specifies complimentary enhancements to the
[old Realms API proposal](https://gist.github.com/dherman/7568885)
focused on making lightweight realms that derive from a shared frozen
realm. The proposal here is intended to compose well with the
remainder of the old `Realm` proposal but is not dependent on any of
its elements not re-presented here. These proposals each have utility
without the other, and so can be proposed separately. However,
together they have more power than each separately.

We motivate the frozen Realm API presented here with a variety of
examples.


## Summary

In ECMAScript, a _realm_ consists of a global object and an associated
set of _primordial objects_ -- mutable objects like `Array.prototype`
that must exist before any code runs. Objects within a realm
implicitly share these primordials and can therefore easily disrupt
each other by _primordial poisoning_ -- modifying these objects to
behave badly. This disruption may happen accidentally or
maliciously. Today, in the browser, realms can be created via _same
origin iframes_. On creation, these realms are separate from each
other. However, to achieve this separation, each realm needs its own
primordials, making this separation too expensive to be used at fine
grain.

Though initially separate, realms can be brought into intimate contact
with each other via host-provided APIs.  For example, in current
browsers, same-origin iframes bring realms into direct contact with
each other's objects. Once such realms are in contact, the mutability
of primordials enables an object in one realm to poison the prototypes
of the other realms.

Borrowing from the
[old Realms API proposal](https://gist.github.com/dherman/7568885), we
propose a `Realm` class, each of whose instances are a reification of
the "Realm" concept. The only elements of the old API required here
are the `global` accessor and the `eval` method, re-explained below.

We propose that there be a singleton shared frozen realm consisting
only of transitively immutable primordials, accessible by the static
accessor `Realm.TheFrozenRealm`. We propose a `spawn` method on
instances of the `Realm` class for making a lightweight child realm
consisting of four new objects. Aside from these new objects, the new
child realm inherits all its primordials from its parent realm.

```js
class Realm {
  // From the old Realm API proposal
  get global() -> object                // access this realm's global object
  eval(stringable) -> any               // do an indirect eval in this realm

  // We expect the rest of old proposal to be proposed eventually but
  // do not rely here on any of the remainder.

  // New with this proposal
  static get TheFrozenRealm() -> Realm  // transitively immutable singleton
  spawn(endowments) -> Realm            // lightweight child realm
}
```

`TheFrozenRealm` consists of all the primordial state defined by
ES2016 (with the exception of the `Date.now` and `Math.random`
methods, as explained below). It contains no host provided objects, so
`window`, `document`, `XMLHttpRequest`, etc... are all absent. Thus,
`TheFrozenRealm` contains none of the objects needed for interacting
with the outside world, like the user or the network.

The `spawn` method makes (1) a new realm with (2) a new `global`
inheriting from its parent's `global`, (3) a new `eval` function
inheriting from its parent's `eval` function, and (4) a new `Function`
constructor inheriting from its parent's `Function` constructor. The
new `eval` and `Function` evaluate code in the global scope of the new
`global` with that `global` as their global object. It then copies the
own enumerable properties from the `endowments` record onto the new
`global` and returns the new realm instance. With these endowments,
users can add back in those host objects that they wish to be
available in the spawned realm.

Although `TheFrozenGlobal` and `spawn` are orthogonal, they are
especially interesting when directly composed:

```js
const realmA = Realm.TheFrozenRealm.spawn({});
const realmB = Realm.TheFrozenRealm.spawn({});
```

Because all the primordials that `realmA` and `realmB` share are
immutable, neither can poison the prototypes of the other. Because
they share no mutable state, they are as fully separate from each
other as two full realms created by two same origin iframes.

Two realms, whether made as above by the `Realm` API or by same origin
iframes, can be put in contact. Once in contact, they can mix their
object graphs freely. When same origin iframes do this, they encounter
an inconvenience and source of bugs we will here call _identity
discontinuities_. For example if code from iframeA makes an array `arr`
that it passes to code from iframeB, and iframeB tests `arr instanceof
Array`, the answer will be `false` since `arr` inherits from the
`Array.prototype` of iframeA which is a different object than the
`Array.prototype` of iframeB.

By contrast, since `realmA` and `realmB` share the `Array.prototype`
they inherit from `TheFrozenRealm`, an array `arr` created by one still
passes the `arr instanceof Array` as tested by the other.

A long recognized best practice is "don't monkey-patch primordials" --
don't mutate any primordial state. Most legacy code obeying this
practice is already compatible with realms descending from
`TheFrozenRealm`. Some further qualifications are explained in the
rest of this document.


## Confinement examples

```js
function confine(src, endowments) {
  return Realm.TheFrozenRealm.spawn(endowments).eval(src);
}
```

This `confine` function is an example of a security abstraction we can
easily build by composing the primitives above. It uses `spawn` to
make a realm descendant from `TheFrozenRealm`, copy the own enumerable
properties of `endowments` onto the global of that new realm, and then
evaluate `src` in the scope of that global and return the result. This
`confine` function is especially useful for _object-capability_
programming. These primitives (together with membranes) can also be
composed to support other security models such as _decentralized
dynamic information flow_ though we have not yet explored this in
detail. (TODO cite Tim Disney's use of membranes for information flow
security.)

(The `confine` function is from SES, which has a
[formal semantics](http://research.google.com/pubs/pub37199.html)
supporting automated verification of some security properties of SES
code.  It was developed as part of the Google
[Caja](https://github.com/google/caja) project; you can read more
about SES and Caja on the Caja website.)


```js
confine('x + y', {x: 3, y: 4})  // -> 7

confine('Object', {})           // -> Object constructor of TheFrozenRealm

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

Alice's code above achieves this if it is evaluated in such a realm --
one descendant from `TheFrozenRealm` in which primordials are
transitively immutable. Otherwise, Bill or Joan could say
`change.__proto__` to access and poison Alice's prototypes, and to
interact with each other in ways Alice did not intend to enable.


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


## Date and Math


In order for `TheFrozenGlobal` to be universally implicitly shared
safely, it must be transitively immutable. Fortunately, of the
standard primordials in ES2016, the only mutable primordial state is
  * Mutable properties of primordial objects
  * The mutable internal [[Prototype]] slot of primordial objects
  * `Math.random`
  * `Date.now`
  * The `Date` constructor called as a constructor with no arguments
  * The `Date` constructor called as a function, no matter what arguments

To make `TheFrozenRealm` transitively immutable, we, respectively
  * Make all these properties non-configurable, non-writable. If an
    accessor property, we specify that its getter must always return
    the same value and its setter either be absent or throw an error
    without mutating any state.
  * Make all primordial objects non-extensible.
  * Remove `Math.random`
  * Remove `Date.now`
  * Have `new Date()` throw a `TypeError`
  * Have `Date(any...)` throw a `TypeError`

See the **Polyfill example** below to see how a user can effectively
add the missing functionality of `Date` and `Math` back in when
appropriate.


## Proposal

  1. Create a single shared frozen realm, `Realm.TheFrozenRealm`, in
     which all primordials are already transitively immutable. These
     primordials include *all* the primordials defined as mandatory in
     ES2016. (And those in
     [draft ES2017](https://tc39.github.io/ecma262/) as of March 17,
     2016, the time of this writing.)  These primordials must include
     no other objects or properties beyond those specified here. In
     `TheFrozenRealm` the global object itself is also transitively
     immutable. Specifically, it contains no host-specific
     objects. This frozen global object is a plain object whose
     `[[Prototype]]` is `Object.prototype`, i.e., the
     `%ObjectPrototype%` intrinsic of `TheFrozenRealm`.

  1. In order to attain the necessary deep immutability of
     `TheFrozenRealm`, two of its primordials must be modified from
     the existing standard: `TheFrozenRealm`'s `Date` object has its
     `now()` method removed and its default constructor changed to
     throw a `TypeError` rather than reveal the current time.
     `TheFrozenRealm`'s `Math` object has its `random()` method
     removed.

  1. Add to the `Realm` class a new instance method, `spawn(endowments)`.
     1. `spawn` creates a new child realm with its own fresh global object
        (denoted below by the symbol `freshGlobal`) whose
        `[[Prototype]]` is the parent realm's global object. This
        fresh global is also a plain object. Unlike the global of
        `TheFrozenRealm`, the `freshGlobal` is not frozen by default.

     1. `spawn` populates this `freshGlobal` with overriding
        bindings for the evaluators that have global names (currently
        only `eval` and `Function`). It binds each of these names to
        fresh objects whose `[[Prototype]]`s are the corresponding
        objects from the parent realm.

     1. `spawn` copies the own enumerable properties from the
        `endowments` record onto the `freshGlobal`.

     1. `spawn` returns that new child realm instance.

     The total cost of a new spawned realm is four objects: the realm
     instance itself, the `freshGlobal` and the `eval` function and
     `Function` constructor specific to it.

  1. The evaluators of a spawned realm evaluate code in the global
     scope of that realm's global, using that
     global as their global object.

     A spawned realm's initial `eval` inherits from their parent's
     `eval`. For each of the overriding constructors (currently only
     `Function`), their `"prototype"` property initially has the same
     value as the constructor they inherit from. Thus, a function
     `foo` from one descendant realm passes the `foo instanceof
     Function` test using the `Function` constructor of another
     descendant of the same parent realm. Among sibling spawned
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
frozen-enough realm, that can be used like `TheFrozenRealm` as a
spawning root for making children realms that are separated-enough
from each other, if one is not worried about non-overt
channels. Unlike the realms directly descendant from `TheFrozenRealm`,
children spawned from a common cold realm share a fully functional
`Date` and `Math`.


```js
function makeColdRealm(GoodDate, goodRandom) {
  const goodNow = GoodDate.now;
  const {Date: SharedDate, Math: SharedMath} = Realm.TheFrozenRealm;
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
  FreshDate.__proto__ = SharedDate;
  FreshDate.now = Object.freeze(() => +goodNow());
  FreshDate.prototype = SharedDate.prototype;  // so instanceof works
  FreshDate.name = SharedDate.name;

  const FreshMath = {
    __proto__: SharedMath,
    random() { return +goodRandom(); }
  };
  Object.freeze(FreshMath.random);

  const freshRealm = Realm.TheFrozenGlobal.spawn({
    Date: Object.freeze(FreshDate),
    Math: Object.freeze(FreshMath)
  });
  Object.freeze(freshRealm.global);
  Object.freeze(freshRealm.global.eval);
  Object.freeze(freshRealm.global.Function);
  return freshRealm;
}
```

In addition to `Date` and `Math`, we can create abstractions to endow
a fresh global with virtualized emulations of expected host-provided
globals like `window`, `document`, and `XMLHttpRequest`. These
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
price of avoiding identity discontinuities between realms spawned from
a common parent. We have chosen these breaks carefully to be
compatible with virtually all code not written specifically to test
standards conformance.

This proposal by itself is not adequate to polyfill intrinsics like
`%ArrayPrototype%` that can be reached by syntax. Spawning a
descendant realm using only the API proposed here, a polyfill can
replace what object is looked up by the expression `Array.prototype`,
but the expression `[]` will still evaluate to an array that inherits
from the `%ArrayPrototype%` instrinsic of the parent realm. This is
obviously inadequate, but is best addressed by moving the rest of the
[old Realm API proposal](https://gist.github.com/dherman/7568885)
towards standardization in a separate proposal.


### Mobile code example

Map-Reduce frameworks vividly demonstrate the power of sending the
code to the data, rather than the data to the code. Flexible
distributed computing systems must be able to express both.

Now that `Function.prototype.toString` will give a
[reliably evaluable string](http://tc39.github.io/Function-prototype-toString-revision/)
that can be sent, `TheFrozenRealm` provides a safe way for the
receiver to evaluate it, in order to reconstitute that function's call
behavior in a safe manner. Say we have a `RemotePromise` constructor
that makes a
[remote promise for an object that is elsewhere](https://github.com/kriskowal/q-connection),
potentially on another machine. Below, assume that the `RemotePromise`
constructor initializes this remote promise's private instance
variable `#farEval` to be another remote promise, for the
`Realm.TheFrozenRealm.eval` of the location (vat, worker, agent, event
loop, place, ...) where this promise's fulfillment will be. If this
promise rejects, then its `#farEval` promise likewise rejects.

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
`Math.random()`) are disabled in `TheFrozenRealm`, and therefore by
default in each realm spawned from it. New sources of non-determinism,
like `makeWeakRef` and `getStack` will not be added to the
`TheFrozenRealm` realm or will be similarly disabled.

The ECMAScript specs to date have never admitted the possibility of
failures such as out-of-memory. In theory this means that a conforming
ECMAScript implementation requires an infinite memory
machine. Unfortunately, these are currently in short supply. Since
ECMAScript is an implicitly-allocating language, the out-of-memory
condition could cause computation to fail at any time. If these
failures are reported by
[unpredictably throwing a catchable exception](https://docs.oracle.com/javase/8/docs/api/java/lang/VirtualMachineError.html),
then defensive programming becomes impossible. This would be contrary
to the goals
[of much ECMAScript code](https://github.com/tc39/ecmascript_sharedmem/issues/55). Thus,
any ECMAScript computation that wishes to defend its invariants, and
any synchronous computation it is entangled with, on encountering an
unpredictable error, must
[preemptively abort without running further user code](https://github.com/tc39/ecmascript_sharedmem/issues/55).

Even if ECMAScript were otherwise deterministically replayable, these
unpredictable preemptive failures would prevent it. We examine instead
the weaker property of *fail-stop determinism*, where each replica
either fails, or succeeds in a manner identical to every other
non-failing replica.

Although they are few in number, there are a number of specification
issues that are observably left to implementations, on which
implementations differ. Some of these may eventually be closed by
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

Even without pinning down the precise meaning of "implementation
defined", a computation that is limited to fail-stop
implementation-defined determinism _**cannot read covert channels and
side channels**_ that it was not explicitly enabled to read. Nothing
can practically prevent signalling on covert channels and side
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
are safe for inclusion as normative optionals of
`TheFrozenRealm`. However, where Annex B states that these are
normative mandatory in a web browser, there is no such requirement for
`TheFrozenRealm`. Even when run in a web browser, `TheFrozenRealm`,
having no host specific globals, must be considered a non-browser
environment. Some post-ES2015 APIs proposed for Annex B, such as the
[`RegExp` statics](https://github.com/claudepache/es-regexp-legacy-static-properties)
and the
[`Error.prototype.stack` accessor property](https://mail.mozilla.org/pipermail/es-discuss/2016-February/045579.html),
are not safe for inclusion in `TheFrozenRealm` and must be absent.

At this time, to maximize compatability with normal ECMAScript, we do
not alter `TheFrozenRealm`'s evaluators to evaluate code in strict
mode by default. However, we should consider doing so. Most of the
code, including legacy code, that one would wish to run under
`TheFrozenRealm` is probably already compatible with strict
mode. Omitting sloppy mode from `TheFrozenRealm` and its spawned
descendants would also make sections
[B.1.1](http://www.ecma-international.org/ecma-262/6.0/#sec-additional-syntax-numeric-literals),
[B.1.2](http://www.ecma-international.org/ecma-262/6.0/#sec-additional-syntax-string-literals),
[B.3.2](http://www.ecma-international.org/ecma-262/6.0/#sec-labelled-function-declarations),
[B.3.3](http://www.ecma-international.org/ecma-262/6.0/#sec-block-level-function-declarations-web-legacy-compatibility-semantics),
and
[B.3.4](http://www.ecma-international.org/ecma-262/6.0/#sec-functiondeclarations-in-ifstatement-statement-clauses)
non issues. It is unclear what `TheFrozenRealm`'s evaluators should
specify regarding the remaining normative optional syntax in section
B.1. But the syntax accepted by these evaluators, at least in strict
mode, should probably be pinned down precisely by the spec.

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

Because `TheFrozenRealm` is transitively immutable, we can safely
share it between ECMAScript programs that are otherwise fully
isolated. This sharing gives them access to shared objects and shared
identities, but no ability to communicate with each other or to affect
any state outside themselves. We can even share `TheFrozenRealm`
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
these builtins could be defined in a realm spawned from
`TheFrozenRealm`, making defensiveness easier to achieve with higher
confidence.

Because of the so-called "[override mistake](
http://wiki.ecmascript.org/doku.php?id=strawman:fixing_override_mistake)",
for many or possibly all properties in this frozen state, primordial
objects need to be frozen in a pattern we call "tamper proofing",
which makes them less compliant with the current language
standard. See the **Open Questions** below for other possibilities.

By the rules above, a spawned realm's `Function.prototype.constructor`
will be the parent realm's `Function` constructor, i.e., identical to
the spawned realm's `Function.__proto__`. In exchange for this odd
topology, we obtain the pleasant property that `instanceof` works
transparently between spawned realms by default -- unless overridden
by a user's polyfill to the contrary.

In ES2016, the `GeneratorFunction` evaluator is not a named global,
but rather an unnamed intrinsic. Upcoming evaluators are likely to
include `AsyncFunction` and `AsyncGeneratorFunction`. These are likely
to be specified as unnamed instrinsics as well. For all of these, the
above name-based overriding of `spawn` is irrelevant and probably not
needed anyway.

Because code evaluated within `TheFrozenRealm` is unable to cause any
affects outside itself it is not given explicit access to, the
evaluators of `TheFrozenRealm` should continue to operate even in
environments in which
[CSP has forbidden normal evaluators](https://github.com/tc39/ecma262/issues/450). By
analogy, CSP evaluator suppression does not suppress
`JSON.parse`. There are few ways in which evaluating code in
`TheFrozenRealm` is more dangerous than JSON data.

Other possible proposals, like private state and defensible `const`
classes, are likely to aid the defensive programming that is
especially powerful in the context of this proposal. But because the
utility of such defensive programming support is not limited to frozen
realms, they should remain independent proposals. (TODO link to
relevant proposals)

For each of the upcoming proposed standard APIs that are inherently
not immutable and powerless:

  * [`defaultLoader`](https://github.com/whatwg/loader/issues/34)
  * [`global`](https://github.com/tc39/proposal-global)
  * [`makeWeakRef`](https://github.com/tc39/proposal-weakrefs/blob/master/specs/weakrefs.md)
  * [`getStack`](https://mail.mozilla.org/pipermail/es-discuss/2016-February/045579.html)
  * [`getStackString`](https://mail.mozilla.org/pipermail/es-discuss/2016-February/045579.html)

they must be absent from `TheFrozenRealm`, or have their behavior
grossly truncated into something safe. This spec will additionally
need to say how they initially appear, if at all, in each individual
spawned realm.  In particular, we expect a pattern to emerge for
creating a fresh loader instance to be the default loader of a fresh
spawned realm. Once some proposed APIs are specced as being provided
by import from
[builtin primordial modules](https://github.com/tc39/ecma262/issues/395),
we will need to explain how they appear in `TheFrozenRealm` and/or the
realms it spawns.


## Open Questions

* It remains unclear how we should cope with the override
  mistake. Above, we propose the tamper proofing pattern, but this
  requires novel effort to become efficient. Alternatively, we could
  specify that the override mistake is fixed in `TheFrozenRealm` and
  its descendants, making the problem go away. This diverges from the
  current standard in a different way, but we have some evidence that
  such divergence will break almost no existing code other than code
  that specifically tests for standards compliance. We could also
  leave it unfixed. This would break some good-practice legacy
  patterns of overriding methods by assignment. But it is compatible
  with overriding by classes and object literals, since they do
  `[[DefineOwnProperty]]` rather than assignment.

  Our sense is that not fixing the override mistake at all will
  [break too much legacy code](https://esdiscuss.org/topic/object-freeze-object-prototype-vs-reality). But
  if fully fixing the override mistake is too expensive, it might be
  that fixing a handful of properties on primordial prototypes that
  are overridden in practice (e.g., `constructor`, `toString`, ...)
  will reduce the breakage to a tolerable level. We need measurements.

* Although not officially a question within the jurisdiction of TC39,
  we should discuss whether the existing CSP "no script evaluation"
  settings should exempt `TheFrozenRealm`'s evaluators, or whether CSP
  should be extended in order to express this differential
  prohibition.

* Currently, if the value of `eval` is anything other than the
  original value of `eval`, any use of it in the form of a direct-eval
  expression will actually have the semantics of an indirect eval,
  i.e., a simple function call to the current value of `eval`. If
  `TheFrozenRealm`'s builtin evaluators are not strict by default,
  then any user customization that replaces a spanwed realm's global
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

## Acknowledgements

Many thanks to E. Dean Tribble, Kevin Reid, Dave Herman, Michael
Ficarra, Tom Van Cutsem, Kris Kowal, Kevin Smith, Terry Hayes, Daniel
Ehrenberg, Ojan Vafai, Elliott Sprehn, and Alex Russell. Thanks to the
entire Caja team (Jasvir Nagra, Ihab Awad, Mike Stay, Mike Samuel,
Felix Lee, and Kevin Reid) for building a system in which all the
hardest issues have already been worked out.
