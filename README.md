# Draft Proposed Standard SES

This document specifies an API and accompanying language changes to incorporate
SES -- Secure ECMAScript, an ocap secure subset of ECMAScript -- into the
standard ECMAScript platform.


## Background

ECMAScript developers produce applications by mingling their code with
code written by others, such as frameworks and libraries. These pieces
may cooperate as the developer intends, or they may destructively
interfere with each other.  Even under the best of intentions, the
likelihood of interference grows as the size and complexity of the
application grows, and as the application's code ecosystem grows. This
coordination problem limits the scale and functionality of
the software we can successfully compose.

This coordination problem becomes harder once we account for
deliberate misbehavior.  The large user-base of a successful web
application makes a tempting target for bad actors. Yet the size and
complexity of such applications, and the diversity of their
components, makes them vulnerable to the introduction of malicious
components.

In software engineering, a successful strategy for reducing these
coordination problems has been to isolate potentially interfering
components from each other, limiting their interactions to selected,
well-defined channels.  This has been the motivation behind many of
the advances in the field, including lexical scoping, object-oriented
programming, module systems, and memory safety, to name just a few
examples.  In the world of object-oriented programming, the gold
standard for such isolation is the object capability (ocap) model.
The ocap model is perhaps best understood in contrast to more
conventional object systems.

In an object language, an object reference allows its holder to
invoke methods on the public interface of the object it designates. Such an
invocation in turn grants to the called object the means to similarly make
method invocations on any object references that are passed as arguments.

In a memory-safe object language, object references are _unforgeable_,
that is, there is no way within the language for code to "manufacture"
a reference to a pre-existing object. In a memory-safe object language
in which _encapsulation_ is unbreakable, objects may hold state --
including references to other objects -- that is totally inaccessible
to code outside themselves.

With these familiar restrictions we can guarantee that the only way
for one object to come to possess a reference to a second object is
for them to have been given that reference by somebody else, or for
one of them to have been the creator of the other. We can make strong,
provable assertions about the ability of object references to
propagate from one holder to another, and thus can reason reliably
about the evolution of the object reference graph over time.
ECMAScript is a language with these properties.

With two additional restrictions,
  * that the only way for an object to cause any effect on the world
    outside itself is by using references it already holds, and
  * that no object has default or implicit access to any other objects
    (for example, via language provided global variables) that are not
    already transitively immutable and powerless,

we have an object-capability (ocap) language.  In an ocap language,
object references are the sole representation of permission.

(An object is _transitively immutable_ if no mutable state is
reachable in the object graph starting at that object. An object is
_powerless_ if it is unable to cause I/O. For example, in Java, even
the seemingly immutable square root function in a math library is not
powerless because it is able to import java.io.File and delete all
your files. If we include the external world in our notion of mutable
state, then "transitively immutable" necessarily implies
"powerless". In the remainder of this document, we use _transitively
immutable_ for this joint restriction.)

Ocap languages enable us to program objects that are defensively
consistent -- that is, they can defend their own invariants and
provide correct service to their well behaved clients, despite
arbitrary or malicious misbehavior by their other clients.  Ocap
languages help address the coordination problem described above, of
enabling disparate pieces of code from mutually suspicious parties to
interoperate in a way that is both safe and useful at the same time.

Although stock ECMAScript satisfies our first set of requirements for
a strongly memory safe object language with unbreakable encapsulation,
it is *not* an ocap language.  The runtime environment specified by
the ECMA-262 standard mandates globally accessible objects with
mutable state.  Moreover, typical hosting environments, browsers and
servers, provide default access to additional powerful objects that
can affect parts of the outside world, such as the browser DOM or the
Internet.  However, ECMAScript *can* be transformed into an ocap
language by careful language subsetting combined with some fairly
simple changes to the default execution environment.

SES -- Secure ECMAScript -- is such a subset.

(The **Virtualized Powers** example below shows how a SES user can provide a
compatible virtual host environment to the code it confines.)

SES derives an ocap environment from a conventional ECMAScript
environment through a small number of carefully chosen modifications:
  * SES requires that all the _primordial objects_ -- objects like
    `Array.prototype`, mandated by the ECMAScript language
    specification to exist before any code starts running -- be made
    transitively immutable, and
  * SES forbids any references to any other objects that are not
    already transitively immutable (including `window`, `browser`,
    `XMLHttpRequest`, ...) from being reachable from the initial
    execution state of the environment.

These restrictions must be in place before any (user) code is allowed
to run.  We can achieve this by running special preamble code
beforehand that enforces these restrictions by modifying a stock
environment in place, or by providing the restricted environment
directly as part of the underlying execution engine.

Although programs in SES are limited to a subset of the full
ECMAScript language, SES will compatibly run nearly all ES5 or later
code that follows recognized ECMAScript best practices. In fact, many
features introduced in ES5 and ES2015 were put there specifically to
enable this subsetting and restriction, so that we could realize a
secure computing environment for ECMAScript without additional special
support from the engine.

SES has a
[formal semantics](http://research.google.com/pubs/pub37199.html)
supporting automated verification of some security properties of SES
code.  It was developed as part of the Google
[Caja](https://github.com/google/caja) project; you can read more
about SES and Caja on the Caja website.

SES is
[currently implemented in ECMAScript as a bundle of preamble code](https://github.com/google/caja/tree/master/src/com/google/caja/ses)
that is run first on any SES-enabled web page.  Here, we will refer to
this implementation as the **SES-shim**, since it polyfills an
approximation of SES on any platform conforming to ES5 or later.  To
do its job, this preamble code must freeze all the primordials. The
time it takes to individually walk and freeze each of these objects
makes initial page load expensive, which has inhibited SES adoption.

With the advent of ES2015, the number of primordials has ballooned,
making the SES-shim implementation strategy even more
expensive. However, we can avoid this large per-page expense by making
SES a standard part of the platform, so that an appropriately confined
execution environment can be provided natively. Any necessary
preamble computation need only be done once per browser startup as
part of the browser implementation.  The mission of this document is
to specify an API and a strategy for incorporating SES into the
standard ECMAScript platform.

We want the standard SES mechanism to be sufficiently lightweight that
it can be used promiscuously.  Rather than simply isolating individual
pieces of code so they can do no damage, we also want to make it
possible to use these confined pieces as composable building blocks.

(TODO rewrite runon)
Consequently, code that is responsible for integrating separate
isolated pieces also should be able to selectively connect them in
controlled ways to each other, or to other, unconfined objects
provided by this integration code to selectively grant constrained
access to sensitive operations that the confined code would not
otherwise have the power to do.

(See the [Glossary](https://github.com/FUDCo/ses-realm/wiki/Glossary) for
supporting definitions.)


## Proposal

  1. Create a single shared **proto-SES realm** (global scope and set
     of primordial objects) in which all primordials are already
     transitively immutable. These primordials include *all* the
     primordials defined as mandatory in ES2016. (And those in
     [draft ES2017](https://tc39.github.io/ecma262/) as of March 17,
     2016, the time of this writing.)  These primordials must include
     no other objects or properties beyond those specified
     here. Unlike the *SES realms* we define below, in this one shared
     proto-SES realm the global object itself (which we here call the
     **proto-global object**) is also transitively
     immutable. Specifically, it contains no host-specific
     objects. The proto-global object is a plain object.

  1. In order to attain the necessary deep immutability of the
     proto-SES realm, two of its primordials must be modified from the
     existing standard: The proto-SES realm's `Date` object has its `now()`
     method removed and its default constructor changed to throw a
     `TypeError` rather than reveal the current time.  The proto-SES
     realm's `Math` object has its `random()` method removed.

     See the **Virtualized Powers** section below to see how a SES user can
     effectively add these back in when appropriate.

  1. Add to all realms, including the shared proto-SES realm, a new
     fundamental builtin function `Reflect.makeIsolatedRealm()`, which
     creates a new **SES realm** with its own fresh global object
     (denoted below by the symbol `freshGlobal`) whose `[[Prototype]]`
     is the proto-global object. This fresh global is also a plain
     object. Unlike the proto-global, the `freshGlobal` is not frozen
     by default.

     * `Reflect.makeIsolatedRealm()` then populates this `freshGlobal` with
       overriding bindings for the evaluators that have global names
       (currently only `eval` and `Function`). It binds each of these
       names to fresh objects whose `[[Prototype]]`s are the
       corresponding objects from the proto-SES realm. It returns that
       fresh global object.

     The total cost of a new SES realm is three objects: the
     `freshGlobal` and the `eval` function and `Function` constructor
     specific to it.

  1. The evaluators of the proto-SES realm evaluate code in the global
     scope of the proto-SES realm, using the proto-SES realm's frozen
     global as their global object. The evaluators of a specific SES
     realm evaluate code in the global scope of that SES realm, using
     that realm's global object as their global object.

     A SES realm's initial `eval` inherits from proto-SES's
     `eval`. For each of the overriding constructors (currently only
     `Function`), their `"prototype"` property initially has the same
     as the constructor they inherit from. Thus, a function `foo` from
     one SES realm passes the `foo instanceof Function` test using the
     `Function` constructor of another SES realm. Among SES realms,
     `instanceof` on primordial types simply works.

  1. Add to all realms, including the shared proto-SES realm, a new
     property, `Reflect.theProtoGlobal`, whose value is the shared
     global of the proto-SES realm.

  1. Add to all realms, including the shared proto-SES realm, a new
     derived builtin function `Reflect.confine(src, endowments)`. This
     is only a convenience that can be defined in terms of the
     fundamental `Reflect.makeIsolatedRealm()` as shown by code below.

       * `Reflect.confine` first calls (the original)
         `Reflect.makeIsolatedRealm()` to obtain the `freshGlobal` of a new
         SES realm.

       * The own enumerable properties from `endowments` are then
         copied onto this global.  This copying happens *after*
         `makeIsolatedRealm` binds the evaluators, so that the caller of
         `confine` has the option to endow a SES realm with different
         evaluators of its own choosing.

       * Evaluate `src` as if by calling the `eval` method originally
         added to `freshGlobal` by `Reflect.makeIsolatedRealm`.

       * Return the completion value from evaluating `src`. When `src`
         is an expression, this completion value is the value that
         the `src` expression evaluates to.



### The Entire API

```js
Reflect.theProtoGlobal  // global of the shared proto-SES realm
Reflect.makeIsolatedRealm()  // -> fresh global of a new, isolated SES realm
Reflect.confine(src, endowments)  // -> completion value
```

`Reflect.theProtoGlobal` can trivially be derived from
`Reflect.makeIsolatedRealm` by `Reflect.makeIsolatedRealm().__proto__`. We
provide it directly only because it seems wasteful to create a fresh
realm and throw it away, only to access something shared.

`Reflect.confine` can be defined in terms of `Reflect.makeIsolatedRealm` as
follows. For expository purposes, we ignore the difference between
original binding and current binding. Where the code below says, e.g.,
`Reflect.makeIsolatedRealm` we actually mean the original binding of that
expression.

```js
function confine(src, endowments) {
  const freshGlobal = Reflect.makeIsolatedRealm();
  // before possible overwrite by endowments
  const freshEval = freshGlobal.eval;
  Object.define(freshGlobal, endowments);
  return freshEval(src);
}
```

Beyond `theProtoGlobal` and `confine`, further derived API may be
called for, to aid some patterns of use. For now, we assume that such
conveniences will first be user-level libraries before appearing in
later proposals.


## Examples

The **Compartments**, **Virtualized Powers**, and **Mobile Code** examples each
illustrate very different aspect of SES's power. Please look at all three.

### Compartments

By composing
[revocable membranes](http://soft.vub.ac.be/~tvcutsem/invokedynamic/js-membranes)
and `confine`, we can make compartments:

```js
function makeCompartment(src, endowments) {
  const {wrapper,
         revoke} = makeMembrane(Reflect.confine);
  return {wrapper: wrapper(src, endowments),
          revoke};
}

// Obtain billSrc and joanSrc from untrusted clients
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
cause further effects, or even to continue to occupy memory.

### Virtualized Powers

In the **Punchlines** section below, we explain the non-overt channel
threats that motivate the removal of `Date.now` and
`Math.random`. However, usually this threat is not of interest, in
which case we'd rather include the full API of ES2016, since it is
otherwise safe. Indeed, Caja has always provided the
full functionality of `Date` and `Math` because its threat model did
not demand that they be denied.

The following `makeIsolatedRealmPlus` is a function similar to
`makeIsolatedRealm` that also provides the missing functionality from our
own `Date` and `Math.random`, i.e., the `Date` and `Math.random` of
the realm this function definition is evaluated in.

```js
function makeIsolatedRealmPlus() {
  const now = Date.now;  // our own
  const random = Math.random;  // our own
  const freshGlobal = Reflect.makeIsolatedRealm();
  const {Date: SharedDate, Math: SharedMath} = freshGlobal;
  function FreshDate(...args) {
    if (new.target) {
      if (args.length === 0) {
        args = [+now()];  // our own
      }
      return Reflect.construct(SharedDate, args, new.target);
    } else {
      return String(Date());  // our own
    }
  }
  FreshDate.__proto__ = SharedDate;
  FreshDate.now = Object.freeze(() => +now());  // our own
  FreshDate.prototype = SharedDate.prototype;  // so instanceof works
  FreshDate.name = SharedDate.name;
  freshGlobal.Date = Object.freeze(FreshDate);

  const FreshMath = Object.freeze({
    __proto__: SharedMath,
    random() { return +random(); }  // our own
  });
  Object.freeze(FreshMath.random);
  freshGlobal.Math = FreshMath;
  return freshGlobal;
}
```

Alternatively, we could express a similar convenience with a function for
helping to create an endowments record seeded with standard capabilities such
as `FreshDate` and `FreshMath`, which then may be used in a normal `confine`
call. Either way, this full-standard ses-realm-plus costs an additional four
allocations, bringing the total to seven.

In addition to `Date` and `Math`, we could create libraries to seed
the fresh global with virtualized emulations of expected host-provided
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
environment as configured by the caller using SES and Domado.

To run legacy code successfully, the `freshGlobal` should remain
unfrozen, since even good-practice legacy scripts approximate
"inter-module linkage" by modifying their shared global
environment. Prior to real modules, they did not have much
choice. When setting up a SES environment expecting to run only
modules, it may well be reasonable to freeze the `freshGlobal` before
running confined code in that realm. To leave the SES user free to
make that choice, the API proposed here leaves the `freshGlobal`
unfrozen.

Because `eval`, `Function`, and the above `Date` and `Math` observably
shadow the corresponding objects from the proto-SES realm, the SES
environment is not a fully faithful emulation of standard non-SES
ECMAScript. However, these breaks in the illusion are a necessary
consequence of this design. We have chosen these carefully to be
compatible with virtually all code not written specifically to test
standards conformance. The virtualization of host-provided objects
suffers no such cost. There is no similar constraint preventing the
SES user from faithfully emulating a host API.

By composing the **Compartments** and **Virtualized Powers** patterns, one can
*temporarily* invite potentially malicious code onto one's page, endow
it with a subtree of one's own DOM as its virtual document, and then
permanently and fully evict it.

### Mobile code

Map-Reduce frameworks vividly demonstrate the power of sending the
code to the data, rather than the data to the code. Flexible
distributed computing systems must be able to express both.

Now that `Function.prototype.toString` will give a
[reliably evaluable string](http://tc39.github.io/Function-prototype-toString-revision/)
that can be sent, SES provides a safe way for the receiver to evaluate
it, in order to reconsitute that function's call behavior in a safe
manner. Say we have a `RemotePromise` constructor that makes a
[remote promise for an object that is elsewhere](https://github.com/kriskowal/q-connection),
potentially on another machine. Below, assume that the `RemotePromise`
constructor initializes this remote promise's private instance
variable `#farEval` to be another remote promise, for the
`Reflect.theProtoGlobal.eval` of the location (vat, worker, agent,
event loop, place, ...) where this promise's fulfillment will be. If
this promise rejects, then its `#farEval` promise likewise rejects.

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

_We do not include any form of replay within the goals of SES, so
this "How Deterministic" section is only important because of the
punchlines at the end of this section._

Given a deterministic spec, one could be sure that two computations,
run on two conforming implementations, starting from the same state
and fed the same inputs, will compute the same new states and
outputs. The ES5 and ES2015 specs come tantalizingly close to being
deterministic. We have avoided some common but unnecessary sources of
non-determinism like Java's `System.identityHashCode`. But the
ECMAScript specs fail for three reasons:

  * Genuine non-determinism, such as by `Math.random()`.
  * Unspecified but unavoidable failure, such as out-of-memory.
  * Explicit underspecification, i.e. leaving some observable behavior
    up to the implementation.

The explicitly non-deterministic abilities to sense the current time
(via `Date()` and `Date.now()`) or generate random numbers (via
`Math.random()`) are disabled in the proto-SES realm, and therefore by
default in each SES realm. New sources of non-determinism, like
`makeWeakRef` and `getStack` will not be added to the proto-SES realm
or will be similarly disabled.

The ECMAScript specs to date have never admitted the possibility of
failures such as out-of-memory. In theory this means that a conforming
ECMAScript implementation requires an infinite memory
machine. Unfortunately, these are currently in short supply. Since
ECMAScript is an implicitly-allocating language, the out-of-memory
condition could cause computation to fail at any time. If these
failures are reported by
[unpredictably throwing a catchable exception](https://docs.oracle.com/javase/8/docs/api/java/lang/VirtualMachineError.html),
then defensive programming becomes impossible. This would be contrary
to the goals of SES and indeed
[of much ECMAScript code](https://github.com/tc39/ecmascript_sharedmem/issues/55). Thus,
at least SES computation, and any synchronous computation it is
entangled with, on encountering an unpredictable error, must
[preemptively abort without running further user code](https://github.com/tc39/ecmascript_sharedmem/issues/55)).

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
are safe for inclusion as normative optionals of the proto-SES
realm. However, where Annex B states that these are normative
mandatory in a web browser, there is no such requirement for SES. Even
when run in a web browser, the SES environment, having no host
specific globals, must be considered a non-browser environment. Some
post-ES2015 APIs proposed for Annex B, such as the
[`RegExp` statics](https://github.com/claudepache/es-regexp-legacy-static-properties)
and the
[`Error.prototype.stack` accessor property](https://mail.mozilla.org/pipermail/es-discuss/2016-February/045579.html),
are not safe for inclusion in SES and must be absent.

At this time, to maximize compatability with normal ECMAScript, we do
not alter the evaluators to evaluate code in strict mode by
default. However, we should consider doing so. Most of the code,
including legacy code, that one would wish to run under SES is
probably already compatible with strict mode. Omitting sloppy mode
from SES would also make sections
[B.1.1](http://www.ecma-international.org/ecma-262/6.0/#sec-additional-syntax-numeric-literals),
[B.1.2](http://www.ecma-international.org/ecma-262/6.0/#sec-additional-syntax-string-literals),
[B.3.2](http://www.ecma-international.org/ecma-262/6.0/#sec-labelled-function-declarations),
[B.3.3](http://www.ecma-international.org/ecma-262/6.0/#sec-block-level-function-declarations-web-legacy-compatibility-semantics),
and
[B.3.4](http://www.ecma-international.org/ecma-262/6.0/#sec-functiondeclarations-in-ifstatement-statement-clauses)
non issues. It is unclear what SES should specify regarding the
remaining normative optional syntax in section B.1, but the syntax
accepted by SES, at least in strict mode, should probably be pinned
down precisely by the spec.

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
[whitelisted in the SES-shim](https://github.com/google/caja/blob/master/src/com/google/caja/ses/whitelist.js#L85)
for a long time without problem. (The last bullet above is syntax and
so not subject to the SES-shim whitelisting mechanism.)


## Discussion

Because the proto-SES realm is transitively immutable, we can safely
share it between ECMAScript programs that are otherwise fully isolated. This
sharing gives them access to shared objects and shared identities, but
no ability to communicate with each other or to affect any state
outside themselves. We can even share proto-SES primordials between
origins and between threads, since deep immutability at the
specification level should make thread safety at the implementation
level straightforward.

Each call to `Reflect.makeIsolatedRealm()` allocates only three objects:
the fresh global and its fresh `eval` function and `Function`
constructor. In a browser environment, a SES-based confined seamless
iframe could be lightweight, since it would avoid the need to create
most per-frame primordials. Likewise, we could afford to place each
[web component](http://webcomponents.org/) into its own confinement
box. By using Domado-like techniques, the actual DOM can be safely
encapsulated behind the component's shadow DOM.

Today, to self-host builtins by writing them in ECMAScript, one must
practice
[safe meta programming](http://wiki.ecmascript.org/doku.php?id=conventions:safe_meta_programming)
techniques so that these builtins are properly defensive. This
technique is difficult to get right, especially if such self hosting
is
[opened to ECMAScript embedders](https://docs.google.com/document/d/1AT5-T0aHGp7Lt29vPWFr2-qG8r3l9CByyvKwEuA8Ec0/edit#heading=h.ma18njbt74u3). Instead,
these builtins could be defined in a SES realm, making defensiveness
easier to achieve with higher confidence.

Because of the so-called "[override mistake](
http://wiki.ecmascript.org/doku.php?id=strawman:fixing_override_mistake)",
for many or possibly all properties in this frozen state, primordial
objects need to be frozen in a pattern we call "tamper proofing",
which makes them less compliant with the current language
standard. See the **Open Questions** below for other possibilities.

By the rules above, a SES realm's `Function.prototype.constructor`
will be the proto-SES realm's `Function` constructor, i.e., identical
to the SES realm's `Function.__proto__`. Alternatively, we could
create a per-SES-realm `Function.prototype` that inherits from the
proto-SES realm's `Function.prototype` and overrides the `constructor`
property to point back at its own `Function`. The price of this
technique is that we lose the pleasant property that `instanceof`
works transparently between SES realms.

In ES2016, the `GeneratorFunction` evaluator is not a named global, but
rather an unnamed intrinsic. Upcoming evaluators are likely to include
`AsyncFunction` and `AsyncGeneratorFunction`. These are likely to be
specified as unnamed instrinsics as well. For all of these, the above
name-based overriding of SES vs proto-SES is irrelevant and probably
not needed anyway.

Because code within a SES realm is unable to cause any affects outside
itself it is not given explicit access to, i.e., it is fully confined,
`Reflect.confine` and the evaluators of SES realms should continue to
operate even in environments in which
[CSP has forbidden normal evaluators](https://github.com/tc39/ecma262/issues/450). By
analogy, CSP evaluator suppression does not suppress
`JSON.parse`. There are few ways in which SES-confined code is more
dangerous than JSON data.

Other possible proposals, like private state and defensible `const`
classes, are likely to aid the defensive programming that is
especially powerful in the context of SES. But because the utility of
such defensive programming support is not limited to SES, they should
remain independent proposals. (TODO link to relevant proposals)

For each of the upcoming proposed standard APIs that are inherently
not immutable and powerless:

  * [`defaultLoader`](https://github.com/whatwg/loader/issues/34)
  * [`global`](https://github.com/tc39/proposal-global)
  * [`makeWeakRef`](https://github.com/tc39/proposal-weakrefs/blob/master/specs/weakrefs.md)
  * [`getStack`](https://mail.mozilla.org/pipermail/es-discuss/2016-February/045579.html)
  * [`getStackString`](https://mail.mozilla.org/pipermail/es-discuss/2016-February/045579.html)

they must be absent from the proto-SES realm, or have their behavior
grossly truncated into something safe. This spec will additionally
need to say how they initially appear, if at all, in each individual
SES realm.  In particular, we expect a pattern to emerge for creating
a fresh loader instance to be the default loader of a fresh SES
realm. Once some proposed APIs are specced as being provided by import
from
[builtin primordial modules](https://github.com/tc39/ecma262/issues/395),
we will need to explain how they appear in SES.

---

Prior to standard builtin primordial modules,

```js
Reflect.theProtoGlobal  // global of the shared proto-SES realm
Reflect.makeIsolatedRealm()  // -> fresh global of a new, isolated SES realm
Reflect.confine(src, endowments)  // -> completion value
```

is the *entirety* of the new API proposed here. We believe it is all
that is needed. However, as we develop a better understanding of
patterns of use, we may wish to add other conveniences as well.

---

## Open Questions

* It is not fundamental to our API design that its three elements are placed on
the `Reflect` object. This choice was somewhat arbitrary.  However, until the
[Built-in Modules issue](https://github.com/tc39/ecma262/issues/395) is
resolved, for concreteness we leave these on `Reflect`.

* It remains unclear how we should cope with the override
mistake. Above, we propose the tamper proofing pattern, but this
requires novel effort to become efficient. Alternatively, we could
specify that the override mistake is fixed in the SES realm, making
the problem go away. This diverges from the current standard in a
different way, but we have some evidence that such divergence will
break almost no existing code other than test code that specifically
probes for standards compliance. We could also leave it unfixed. This
would break some good-practice legacy patterns of overriding methods
by assignment. But it is compatible with overriding by classes and
object literals, since they do `[[DefineOwnProperty]]` rather than
assignment.

Our sense is that not fixing the override mistake at all will
[break too much legacy code](https://esdiscuss.org/topic/object-freeze-object-prototype-vs-reality). But
if fully fixing the override mistake is too expensive, it might be
that fixing a handful of properties on primordial prototypes that are
overridden in practice (e.g., `constructor`, `toString`, ...) will
reduce the breakage to a tolerable level. We need measurements.

* Although not officially a question within the jurisdiction of TC39, we
should discuss whether the existing CSP "no script evaluation"
settings should exempt SES's evaluators, or whether CSP should be
extended in order to express this differential prohibition.

* Currently, if the value of `eval` is anything other than the original
value of `eval`, any use of it in the form of a direct-eval expression
will actually have the semantics of an indirect eval, i.e., a simple
function call to the current value of `eval`. If SES itself does not
alter the behavior of the builtin evaluators to be strict by default,
then any user customization that replaces a SES realm's global
evaluators with strict-by-default wrappers will break their use for
direct-eval. We need to do something about this, but it is not yet
clear what.

* The standard `Date` constructor reveals the current time either
  * when called as a constructor with no arguments, or
  * when called as a function (regardless of the arguments)

Above we propose to censor the current time by having the proto-Date
constructor throw a `TypeError` in those cases. Would another error
type be more appropriate? Instead of throwing an Error, should `new
Date()` produce an invalid date, equivalent to that produced by `new
Date(NaN)`? If so, calling the `Date` constructor as a function should
produce the corresponding string `"Invalid Date"`. If we go in this
direction, conceivably we could even have `Date.now()` return
`NaN`. The advantage of removing `Date.now` instead is to support the
feature-testing style practiced by ECMAScript programmers.

* Of course, there is the perpetual bikeshedding of names. We are not
attached to the names we present here.

## Acknowledgements

Many thanks to E. Dean Tribble, Kevin Reid, Michael Ficarra, Tom Van
Cutsem, Kris Kowal, Kevin Smith, Terry Hayes, and Daniel
Ehrenberg. Thanks to the entire Caja team (Jasvir Nagra, Ihab Awad,
Mike Samuel, Kevin Reid, Felix Lee) for building a system in which all
the hardest issues have already been worked out.
