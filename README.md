# Draft Proposed Standard SES

This document specifies an API and accompanying language changes to incorporate
SES -- Secure ECMAScript, an ocap secure subset of ECMAScript -- into the
standard ECMAScript platform.


## Background

It is commonplace for ECMAScript developers to produce applications by
co-mingling their own code with code provided by others -- frameworks and
libraries, for example (of course this pattern is by no means limited to
ECMAScript, but that's what we are concerned with here).  There are vast
opportunities for the operation of these various pieces to interfere with each
other.  The chance of such interference grows as the size and complexity of the
application grows, and as the number of participants in the application's code
ecosystem also grows.  The various parties contributing code to an application
may be mutually suspicious, but even if they are not, any coordination among
them is now relatively weak, usually limited to what is imposed by the
ECMAScript language itself and by the computational environment in which the
code is running (typically a web browser or a Node.js instance).  And this is
before we account for deliberate misbehavior.  The large user-base of a
successful web application makes a tempting target for bad actors, yet the size
and complexity of typical such applications (and the consequent large scope of
software they encompass) makes them especially vulnerable to the purposeful
introduction of malicious components.

In software engineering, an historically successful strategy for reducing these
kinds of coordination problems has been to isolate potentially interfering
components from each other, limiting their interactions to selected,
well-defined channels.  This has been the motivation behind many of the
advances in the field, including lexical scoping, object-oriented programming,
module systems, and memory safety, to name just a few examples.  In the world
of object-oriented programming, the gold standard for such isolation is the
object capability (ocap) model.  The ocap model is perhaps best understood in
contrast to more conventional object systems.

In a memory-safe object language, an object reference allows its holder to
invoke methods on the public interface of the object it designates. Such an
invocation in turn grants to the called object the means to similarly make
method invocations on any object references that are passed as arguments.  In a
system in which object references are unforgeable (that is, there is no way
within the language for code to "manufacture" a reference to a pre-existing
object) and in which encapsulation is unbreakable (that is, objects may hold
state -- including references to other objects -- that is totally inaccessible
to code outside themselves), then we can guarantee that the only way for one
object to come to possess a reference to a second object is for them to have
been given that reference by somebody else, or for one of them to have been the
creator of the other.  In a language with these properties, we can make strong,
provable assertions about the ability of object references to propagate from
one holder to another, and can thus reason reliably about the evolution of the
object reference graph over time.  ECMAScript (JavaScript) is a language with
these properties.

With two additional restrictions, (1) that the only way for an object to cause
any effect on the world outside itself is by using references it already holds,
and (2) that no object has default or implicit access to any other objects
(e.g., via language provided global variables) that are not already
transitively immutable and powerless, we have an object-capability (ocap)
language.  In an ocap language, object references are the sole representation
of permission.

Ocap languages enable us to program objects that are defensively consistent --
that is, they can defend their own invariants and provide correct service to
their well behaved clients, despite arbitrary or malicious misbehavior by their
other clients.  Ocap languages thus provide a way to solve the coordination
problem described above, of enabling disparate pieces of code from mutually
suspicious parties to interoperate in a way that is both safe and useful at the
same time.

In order to solve this problem in the ECMAScript environment, it would be ideal
if ECMAScript was an ocap language.  However, although stock ECMAScript
satisfies our first set of requirements for a strongly memory safe object
language, it is *not* an ocap language.  The runtime environment specified by
the ECMA-262 standard mandates globally accessible objects with
mutable state.  Moreover, typical implementations provide default access to
additional powerful objects that can affect parts of the outside world, such as
the browser DOM or the Internet.  However, ECMAScript *can* be transformed into
an ocap language by careful language subsetting combined with some fairly
simple changes to the default execution environment.

SES -- Secure ECMAScript -- is such a subset.

SES derives an ocap environment from a conventional ECMAScript environment
through a small number of carefully chosen modifications.  SES specifies two
particular sets of such modifications: (1) it requires that all the primordial
objects -- objects like `Array.prototype`, mandated by the ECMAScript language
specification to exist before any code starts running -- be made transitively
immutable, and (2) it forbids any references to any other objects that are not
already transitively immutable and powerless from being reachable from the
initial execution state of the environment (notably including such typical
browser provided globals as `window` or `document`).

These restrictions must be in place prior to to any (user) code being allowed
to run.  This can be achieved either by arranging to run special code
beforehand that introduces the restrictions by actually modifying the stock
environment in place, or the restricted environment may be provided directly by
the underlying execution engine.

Although programs in SES are limited to a subset of the full ECMAScript
language, SES will compatibly run nearly all ES5 or later code that follows
recognized ECMAScript best practices. In fact, many features
introduced in ES5 and
ES2015 were put there specifically to enable this subsetting and restriction,
so that we could realize a secure computing environment for JavaScript without
additional special support from the engine.

SES has a [formal semantics](http://research.google.com/pubs/pub37199.html)
supporting automated verification of some security properties of SES code.  It
was developed as part of the Google [Caja](https://github.com/google/caja)
project; you can read much more about SES specifically and Caja more generally
on the Caja website.

SES is [currently implemented in JavaScript as a bundle of preamble
code](https://github.com/google/caja/tree/master/src/com/google/caja/ses) that
is run first on any SES-enabled web page.  Here, we will refer to this
implementation as the **SES-shim**, since it polyfills an approximation of SES
on any platform conforming to ES5 or later.  To do its job, this preamble code
must freeze all the primordials. The time it takes to individually walk and
freeze each of these objects makes the initial page load expensive, which has
inhibited SES adoption.

With the advent of ES2015, the number of primordials has ballooned, making the
SES-shim implementation strategy even more expensive. However, this large
per-page expense can be avoided by making SES a standard part of the platform,
so that an appropriately confined execution environment can be provided
natively, while any necessary preamble computation need only be done once per
browser startup as part of the browser implementation.  The mission of this
document is to specify an API and a strategy for incorporating SES into the
standard ECMAScript platform.

We want the standard SES mechanism to be sufficiently lightweight that it can
be used promiscuously.  Rather than simply isolating individual pieces of code
so they can do no damage, we also want to make it possible to use these
confined pieces as composable building blocks.  Consequently, code that is
responsible for integrating separate isolated pieces also should be able to
selectively connect them in controlled ways to each other, or to other,
unconfined objects provided by this integration code to selectively grant
constrained access to sensitive operations that the confined code would not
otherwise have the power to do. (TODO defensive consistency)

This is in deliberate contrast to sandboxing strategies, which aim to simply
partition a piece of subsidiary code from its host, without considering the
importance of interoperation or the deliberate injection of authority to
perform functions not normally available in a sandbox.

(See the [Glossary](https://github.com/FUDCo/ses-realm/wiki/Glossary) for
supporting definitions.)


## Proposal

  1. Create a single shared **proto-SES realm** (global scope and set of
     primordial objects) in which all primordials are already transitively
     immutable and authority-free. These primordials include *all* the
     primordials defined as mandatory in ES2016. (And those in
     [draft ES2017](https://tc39.github.io/ecma262/) as of March 17,
     2016, the time of this writing.)  These primordials
     must include no other
     objects or properties beyond those specified here. Unlike the *SES realms*
     we define below, in this one shared proto-SES realm the global object
     itself (which we here call the **proto-global object**) is also
     transitively immutable and authority-free. Specifically, it contains no
     host-specific objects. The proto-global object is a plain object.

  1. In order to attain the necessary deep immutability of the proto-SES realm,
     two of its primordials must be modified from the standard: The proto-SES
     realm's `Date` object has its `now()` method removed and its default
     constructor changed to throw a `TypeError` rather than reveal the current
     time _(Would a different error be more appropriate?)_.  The proto-SES
     realm's `Math` object has its `random()` method removed.

     See the Virtual Powers section below to see how a SES user can
     effectively add these back in.

  1. Add to all realms, including the shared proto-SES realm, a new
     fundamental builtin function `Reflect.makeSESRealm()`, which
     creates a new **SES realm** with its own fresh global object
     (denoted in the explanation below by the symbol `freshGlobal`)
     whose `[[Prototype]]` is the proto-global object. This fresh
     global is also a plain object.

     * `Reflect.makeSESRealm()` then populates this `freshGlobal` with
       overriding bindings for the evaluators that have global names
       (currently only `eval` and `Function`). It binds each of these
       names to fresh objects whose `[[Prototype]]`s are the
       corresponding objects from the proto-SES realm. It returns that
       fresh global object.

  1. The evaluators of the proto-SES realm evaluate code in the global
     scope of the proto-SES realm, using the proto-SES realm's frozen
     global as their global object. The evaluators of a specific SES
     realm evaluate code in the global scope of that SES realm, using
     that realm's global object as their global object.

     A SES realm's initial `eval` inherits from proto-SES's
     `eval`. For each of the overriding constructors (currently only
     `Function`), their `prototype` is the same as the constructor
     they inherit from. Thus, a function `foo` from one SES realm
     passes the `foo instanceof Function` test using the `Function`
     constructor of another SES realm, etc. Among SES realms,
     `instanceof` on primordial types simply works.

  1. Add to all realms, including the shared proto-SES realm, a new
     property, `Reflect.SESProtoGlobal`, whose value is the shared
     global of the proto-SES realm.

  1. Add to all realms, including the shared proto-SES realm, a new
     derived builtin function `Reflect.confine(src, endowments)`. This
     is only a convenience that can be defined in terms of the
     fundamental `Reflect.makeSESRealm()` as shown by code below.

       * `Reflect.confine` first calls (the original)
         `Reflect.makeSESRealm()` to obtain the `freshGlobal` of a new
         SES realm.

       * The own enumerable properties from `endowments` are then
         copied onto this global.  This copying happens *after*
         `makeSESRealm` binds the evaluators, so that the caller of
         `confine` has the option to endow a SES realm with different
         evaluators of its own choosing.

       * Evaluate `src` as if by calling the `eval` method originally
         added to `freshGlobal` prior to copying in the endowments.

       * Return the completion value from evaluating `src`. When `src`
         is an expression, this completion value is the value that
         the `src` expression evaluates to.



### Entire API

```js
Reflect.SESProtoGlobal  // global of the shared proto-SES realm
Reflect.makeSESRealm()  // -> fresh global of new SES realm
Reflect.confine(src, endowments)  // -> completion value
```

These are not necessarily placed on the `Reflect` object. However,
until the
[Built-in Modules issue](https://github.com/tc39/ecma262/issues/395)
is resolved, for concreteness we leave these on `Reflect`.

`Reflect.SESProtoGlobal` can trivially be derived from
`Reflect.makeSESRealm` by `Reflect.makeSESRealm().__proto__`. We
provide it directly only because it seems wasteful to create a fresh
realm and throw it away, only to access something shared.

`Reflect.confine` can be defined in terms of `Reflect.makeSESRealm` as
follows. For expository purposes, we ignore the difference between
original binding and current binding. Where the code below says, e.g.,
`Reflect.makeSESRealm` we actually mean the original binding of that
expression.

```js
function confine(src, endowments) {
  const freshGlobal = Reflect.makeSESRealm();
  // before possible overwrite by endowments
  const freshEval = freshGlobal.eval;
  Object.define(freshGlobal, endowments);
  return freshEval(src);
}
```

Beyond `SESProtoGlobal` and `confine`, further derived API may be
called for, to aid some patterns of use. For now, we assume that such
conveniences will first be user-level libraries before appearing in
later proposals.


## Examples

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

// ... introduce mutually suspicious Bill and Joan. Use both ...
killBill();
// ... Bill is inaccessible to us and to Joan. GC can collect Bill ...
```

### Virtualized Powers

We can make functions like `makeSESRealm` that first provides the
missing functionality from our own `Date` and `Math.random`, to
faithfully emulate full ES2016. Usually, non-determinism is not a
threat of interest, in which case the following `makeSESRealmPlus` is
perfectly safe to use instead.

```js
function makeSESRealmPlus() {
  const now = Date.now;  // our own
  const random = Math.random;  // our own
  const freshGlobal = Reflect.makeSESRealm();
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
  Object.freeze(FreshMath.now);
  freshGlobal.Math = FreshMath;
  return freshGlobal;
}
```

Alternatively, we could express such a convenience with a function for
helping to create an endowments record seeded with such a `FreshDate`
and `FreshMath`, to then be used in a normal `confine` call.

In addition to `Date` and `Math`, we can create libraries for seeding
the fresh global with virtualized emulations of expected host-provided
globals like `window` and `document`. These emulations may map into
the caller's own or
not. [Caja's Domado subsystem](https://github.com/google/caja/blob/master/src/com/google/caja/plugin/domado.js)
uses exactly this technique to emulate most of the conventional
browser and DOM APIs by mapping the confined code's virtual DOM into
portions of the "physical" DOM, as the caller specifies. In this
sense, the confined code is like user-mode code in an operating
system, whose virtual memory accesses are mapped to physical memory by
a mapping it does not see or control. Domado remaps uri space in a
similar manner. By emulating the browser api, much existing browser
code runs compatibly in a virtualized browser environment as
configured by the caller using SES and Domado.

Of course, the Compartments and Virtualized Powers patterns can be
composed, enabling one to *temporarily* invite potentially malicious
code onto one's page, endow it with a subtree of one's own DOM as
its virtual document, and then permanently and fully evict it.

### Mobile code

Map-Reduce frameworks vividly demonstrate the power of sending the
code to the data, rather than the data to the code. Flexible
distributed computing systems must be able to express both.

Now that `Function.prototype.toString` will give a
[reliably evaluable string](http://tc39.github.io/Function-prototype-toString-revision/)
that can be sent, SES provides a safe way for the receiver to evaluate
it, in order to reconsitute that function's call behavior in a safe
manner. Below, assume that the RemotePromise constructor initializes
this [remote promise](https://github.com/kriskowal/q-connection)'s
private instance variable `#farEval` to be another remote promise, for
the `Reflect.SESProtoGlobal.eval` of the location (vat, worker, agent,
event loop, ...) where this promise's fulfillment will be.

```js
class QPromise extends Promise {
  // ... api from https://github.com/kriskowal/q/wiki/API-Reference
  // All we actually use below is fcall
}

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

We explain `where` by analogy. The familiar expression
`Promise.resolve(p).then(callback)` postpones the `callback` function
to some future time after the promise `p` has been fulfilled. In like
manner, the expression `RemotePromise.resolve(r).there(callback)`
postpones and migrates the closed `callback` function to some future
time and space, where the object that will be designated by the
fulfilled remote promise `r` is located. This supports a federated
form of the
[Asynchronous Partitioned Global Address Space](http://citeseerx.ist.psu.edu/viewdoc/summary?doi=10.1.1.464.557)
concurrency model used by the X10 supercomputer language.


## Annex B considerations

As of ES2016, the normative optionals of
[Annex B](http://www.ecma-international.org/ecma-262/6.0/#sec-additional-ecmascript-features-for-web-browsers)
seem safe for inclusion as normative optionals of the proto-SES
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


## How Deterministic?

_We do not include any form of replay within the goals of SES, so
this "How Deterministic" section is only important because of the
punchlines at the end of this section._

Given a deterministic spec, one could be sure that two computations,
starting from the same state, run on two conforming implementations,
and fed the same inputs, will compute the same new states and outputs. The
ECMAScript 5 and 2015 specs come tantalizingly close to being
deterministic. They have avoided some common but unnecessary sources
of non-determinism like Java's `Object.hashCode`. But the ECMAScript
specs fail for three reasons:

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
machine. Unfortunately, these are currently unavailable. Since
JavaScript is an implicitly-allocating language, the out-of-memory
condition could cause computation to fail at any time. If these
failures are reported in a recoverable manner without rollback, such
as by a thrown exception (cite JVM), then defensive programming
becomes impossible. This would be contrary to the goals of at least
SES and indeed to much JavaScript code. (TODO link to SAB discussion
of containing failure.) Thus, at least SES computation, and any
synchronous computation it is entangled with, on unpredictable errors
must either be preemptively aborted without running further user code
(see [Erlang](http://c2.com/cgi/wiki?LetItCrash),
[Joe-E/Waterken](http://waterken.sourceforge.net/),
[Shared Array Buffers](https://github.com/tc39/ecmascript_sharedmem/issues/55))
or roll back to a previous safe point (cite Noether). If repeated
attempts to roll forward from a safe point fail, preemptive
termination is inevitable.

Even if ECMAScript were otherwise deterministically replayable, these
unpredictable preemptive failures would prevent it. We examine instead
the weaker property of *fail-stop determinism*, where each replica
either fails, or succeeds in a manner identical to every other
non-failing replica.

Although they are few in number, there are a number of specification issues
that are observably left to implementations, on which implementations
differ. Some of these may eventually be closed by future TC39 agreement, such
as enumeration order if objects are modified during enumeration (TODO
link). Others, like the sort algorithm used by `Array.prototype.sort` are less
likely. However, *implementatiion-defined* is not necessarily genuine
non-determinism. On a given implementation, operations which are only
implementation-defined can be non-deterministic within the scope of that
implementation. They should be fail-stop reproducible when run on the same
implementation. To make use of this for replay, however, we would need to pin
down what we mean by "same implementation", which seems slippery and difficult.

### The punchlines

Even without pinning down the precise meaning of "implementation
defined", a computation that is limited to fail-stop
implementation-defined determinism _**cannot read covert channels and
side channels**_ that it is not otherwise purposely enabled to
read. Nothing can practically prevent signalling on covert channels
and side channels, but approximations to determinism can practically
prevent confined computations from perceiving these signals.

(TODO explain the anthropic side channel and how it differs from an
information-flow termination channel.)

This fail-stop implementation-defined determinism is also a great boon
to testing and debugging. All non-deterministic inputs, like the
allegedly current time, can be mocked and provided in a reproducible
manner.


## Discussion

Because the proto-SES realm is transitively immutable and
authority-free, we can safely share it between JS programs that are
otherwise fully isolated. This sharing gives them access to shared
objects and shared identities, but no ability to communicate with each
other or to affect any state outside themselves. We can even share
proto-SES primordials between origins and between threads, since deep
immutability at the specification level should make thread safety at
the implementation level straightforward.

Each call to `Reflect.makeSESRealm()` allocates only three objects:
the fresh global and its fresh `eval` function and `Function`
constructor. In a browser environment, a SES-based confined seamless
iframe could be *very* lightweight, since it would avoid the need to
create most per-frame primordials. Likewise, we could afford to place
each [web component](http://webcomponents.org/) into its own
confinement box. By using Domado-like techniques, the actual DOM can
be safely encapsulated behind the component's shadow DOM.

Today, to self-host builtins by writing them in JavaScript, one must
practice
[safe meta programming](http://wiki.ecmascript.org/doku.php?id=conventions:safe_meta_programming)
techniques so that these builtins are properly defensive. This
technique is difficult to get right, especially if such self hosting
is
[opened to JavaScript embedders](https://docs.google.com/document/d/1AT5-T0aHGp7Lt29vPWFr2-qG8r3l9CByyvKwEuA8Ec0/edit#heading=h.ma18njbt74u3). Instead,
these builtin could be defined in a SES realm, making defensiveness
easier to achieve with higher confidence.

Because of the so-called "[override mistake](
http://wiki.ecmascript.org/doku.php?id=strawman:fixing_override_mistake)",
for many or possibly all properties in this frozen state, primordial
objects need to be frozen in a pattern we call "tamper proofing",
which makes them less compliant with the current language
standard. See the Open Questions below for other possibilities.

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

For each of the upcoming proposed standard APIs that are not immutable
and authority-free:

  * [`defaultLoader`](https://github.com/whatwg/loader/issues/34)
  * [`global`](https://github.com/tc39/proposal-global)
  * [`makeWeakRef`](https://github.com/tc39/proposal-weakrefs/blob/master/specs/weakrefs.md)
  * [`getStack`](https://mail.mozilla.org/pipermail/es-discuss/2016-February/045579.html)
  * [`getStackString`](https://mail.mozilla.org/pipermail/es-discuss/2016-February/045579.html)

they must be absent from the proto-SES realm,
or have their behavior grossly truncated into something safe. This
spec will additionally need to say how they initially appear, if at
all, in each individual SES realm.  In particular, we expect a pattern
to emerge for creating a fresh loader instance to be the default
loader of a fresh SES realm. Once some proposed APIs are specced as
being provided by import from
[builtin primordial modules](https://github.com/tc39/ecma262/issues/395),
we will need to explain how they appear in SES.

---

Prior to standard builtin primordial modules,

```js
Reflect.SESProtoGlobal  // global of the shared proto-SES realm
Reflect.makeSESRealm()  // -> fresh global of new SES realm
Reflect.confine(src, endowments)  // -> completion value
```

is the *entirety* of the new API proposed here. We believe it is all
that is needed. However, as we develop a better understanding of
patterns of use, we may wish to add other conveniences as well.

---

## Open Questions

It remains unclear how we should cope with the override
mistake. Above, we propose the tamper proofing pattern, but this
requires novel effort to become efficient. Alternatively, we could
specify that the override mistake is fixed in the SES realm, making
the problem go away. This diverges from the current standard in a
different way, but we have some evidence that such divergence will
break almost no existing code other than test code that specifically
probes for standards compliance. We could also leave it unfixed. This
would break some good practice legacy patterns of overriding methods by
assignment to prototypes, but is compatible with overriding by classes
and object literals, since they do `[[DefineOwnProperty]]` rather than
assignment.

Although not officially a question within the jurisdiction of TC39, we
should discuss whether the existing CSP "no script evaluation"
settings should exempt SES's evaluators, or whether CSP should be
extended in order to express this differential prohibition.

Currently, if the value of `eval` is anything other than the original
value of `eval`, any use of it in the form of a direct-eval expression
will actually have the semantics of an indirect eval, i.e., a simple
function call to the current value of `eval`. If SES itself does not
alter the behavior of the builtin evaluators to be strict by default,
then any user customization that replaces a SES realm's global
evaluators with strict-by-default wrappers will break their use for
direct-eval. We need to do something about this, but it is not yet
clear what.

Of course, there is the perpetual bikeshedding of names. We are not
attached to the names we present here.

## Acknowledgements

Many thanks to E. Dean Tribble, Kevin Reid, Michael Ficarra, Tom Van
Cutsem, Kris Kowal, Kevin Smith, Terry Hayes, and Daniel
Ehernberg. Thanks of the entire Caja team (Jasvir Nagra, Ihab Awad,
Mike Samuel, Kevin Reid, Felix Lee) for building a system in which all
the hardest issues were worked out.
