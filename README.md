# Draft Proposed Standard SES

This document specifies an API and accompanying language changes to incorporate
SES -- Secure EcmaScript, an ocap secure subset of EcmaScript -- into the
standard EcmaScript platform.


## Background:

In a memory-safe object language, an object reference grants the right to
invoke methods on the public interface of the object it designates. Such an
invocation in turn grants to the called object the right to similarly make
method invocations on any object references that are passed as
arguments.  In a system in which
object references are unforgeable (that is, there is
no way within the language for code to "manufacture" a reference to a
pre-existing object) and that encapsulation is unbreakable (that is, objects
may hold state -- including references to other objects -- that is totally
inaccessible to code outside themselves), then we can guarantee that the only
way for one object to come to possess a reference to a second object is for
them to have been given that reference by somebody else, or for one of
them to have been the creator of the other.  In a language that has
these properties, we can make strong, provable assertions about the ability of
object references to propagate from one holder to another, and can thus reason
reliably about the evolution of the object reference graph over time.
EcmaScript (JavaScript) is a language with these properties.

With the additional restrictions that the only way for an
object to cause effects on the
world outside itself is by using references it already holds, and that no
object has default or implicit access to any other objects (e.g., via language
provided global variables) that are not already transitively immutable and
powerless, then we have an object-capability (ocap) language.  In an ocap
language, granted references are the sole representation of permission.

Ocap languages enable us to program objects that are defensively consistent --
that is, they can defend their own invariants and provide correct service to
their well behaved clients, despite arbitrary or malicious misbehavior by their
other clients.

Although stock EcmaScript satisfies our first set of requirements for a
strongly memory safe object language, it is *not* an ocap language.  The runtime
environment specified by the ECMA-262 standard mandates globally accessible
powerful objects with mutable state.  Moreover, typical implementations provide
default access to additional powerful objects that can affect parts of the
outside world, such as the browser DOM or the Internet.  However, it *is*
possible to transform EcmaScript into an ocap language by careful language
subsetting combined with some fairly simple changes to the default execution
environment.

SES -- Secure EcmaScript -- is such a subset.

SES turns a conventional ES5 or ES6 environment into an ocap
environment by imposing various restrictions prior to any code being
allowed to run.  Although programs are limited to a subset of the full
EcmaScript language, SES will compatibly run nearly all ES5 or ES6
code that follows recognized ES best practices. In fact, many features
introduced in ES5 and ES6 were put there specifically to enable this
subsetting and restriction, so that we could realize a secure
computing environment for JavaScript.

SES has a
[formal semantics](http://research.google.com/pubs/pub37199.html)
supporting automated verification of some security properties of SES
code.  It was developed as part of the Google
[Caja](https://github.com/google/caja) project; you can read much more
about SES specifically and Caja more generally on the Caja website.

See [Glossary](https://github.com/FUDCo/ses-realm/wiki/Glossary) for supporting
definitions.


### Existing library implementation: SES5

SES is
[currently implemented in JavaScript as a bundle of preamble
code](https://github.com/google/caja/tree/master/src/com/google/caja/ses)
that is run first on any SES-enabled web page.  To turn a regular
JavaScript environment into an ocap environment, SES must freeze all
primordial objects -- objects like `Array.prototype` -- that are
mandated to exist before any code starts running. The time it takes to
individually walk and freeze each of these objects makes the initial
page load expensive, which has inhibited SES adoption. Here, we will
refer to this implementation as **SES5**, since it requires a platform
compatible with at least ES5 and produces an ocap subset that includes
all of ES5 but, currently, only small portions of ES6.

With the advent of ES6, the number of primordials has ballooned,
making the current implementation strategy even more
expensive. However, this large per-page expense can avoided by making
SES a standard part of the platform, so that an appropriately adjusted
execution environment can be provided directly, while any necessary
preamble computation need only be done once per browser startup as
part of the browser implementation.  The mission of this document is
to specify an API and a strategy for incorporating SES into the
standard EcmaScript platform.


## Proposal:

  1. Create a single shared **proto-SES realm** (global scope and set
     of primordial objects) in which all primordials are already
     transitively immutable and authority-free. Unlike the *SES realms*
     we define below, in this one shared proto-SES realm the global
     object itself is also transitively immutable and
     authority-free. These primordials include *all* the primordials
     defined as mandatory in ES6 and all those defined by later
     ratified ECMAScript specs unless stated otherwise. These
     primordials must include no other objects or properties beyond
     those specified here. Specifically, it contains no host-specific
     objects. The global object is a plain object.

  1. As a consequence of the deep immutability of the proto-SES realm:
     When performed using the proto-SES realm's `Date` and `Math`, the
     expressions `new Date()`, `Date.now()`, and `Math.random()` all
     throw a `TypeError`. (Would another error be more appropriate?)

  1. Add to all realms including the shared proto-SES realm a new
     builtin function `Reflect.confine(src, endowments)`, which
     creates a new **SES realm** with its own fresh global object that
     inherits from the proto-global object. This fresh global is also
     a plain object.
       * This fresh global object is populated with overriding
         bindings for the evaluators with global names, `eval` and
         `Function`. It binds each of these names to fresh objects
         that inherit from the corresponding objects from the
         proto-SES realm.
       * It then copies the own enumerable properties from
         `endowments` onto this global,
       * evaluates `src` as if by
         `freshGlobal.eval(src)`, and
       * returns the completion value. When `src` is an expression,
         the completion value is the value that the expression
         evaluates to.

  1. The evaluators of the proto-SES realm evaluate code in the global
     scope of the proto-SES realm, using the proto-SES realm's frozen
     global as their global object. The evaluators of a specific SES
     realm evaluate code in the global scope of that SES realm, using
     that realm's global object as their global object.

  1. The expression `Reflect.confine('this', {})` therefore simply
     creates a fresh global for a new SES realm, populates it with its
     own overriding evaluators, but otherwise inherits the globals
     from the proto-SES realm's globals, and returns that new
     global. Thus, one can obtain and fully customize the global of a
     new SES realm before running confined code in that realm by
     `freshGlobal.eval(src)`. This is illustrated in the Virtual
     Powers example below.

  1. A SES realm's initial `eval` inherits from proto-SES's
     `eval`. For each of the overriding constructors, their
     `prototype` is the same as the constructor they inherit
     from. Thus, a function `foo` from one SES realm passes the `foo
     instanceof Function` test using the `Function` constructor of
     another SES realm, etc. Among SES realms, `instanceof` on
     primordial types simply works.

### Entire Fundamental API:

```js
Reflect.confine(src, endowments)  // -> completion value
```

Further derived API may be called for, to aid some patterns of
use. For now, we assume that such conveniences will first be
user-level libraries before appearing in a later proposal. The
following examples demonstrate the need for such conveniences.

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

We can make a `confine`-like function that first provides the missing
functionality from our own `Date` and `Math.random`, to faithfully
emulate full ES6.

```js
function confinePlus(src, endowments) {
  const freshGlobal = Reflect.confine('this', {});
  const {Date: SuperDate, Math: SuperMath} = freshGlobal;
  function SubDate(...args) {
    let OtherDate = SuperDate;
    if (new.target) {
      if (args.length === 0) {
        OtherDate = Date;  // our own power
      }
      return Reflect.construct(OtherDate, args, new.target);
    } else {
      return OtherDate(...args);
    }
  }
  SubDate.__proto__ = SuperDate;
  SubDate.now = () => Date.now();  // our own
  SubDate.now.__proto__ = SuperDate.now;
  SubDate.prototype = SuperDate.prototype;  // so instanceof works
  SubDate.name = SuperDate.name;
  freshGlobal.Date = SubDate;

  const SubMath = {
    __proto__: SuperMath,
    random() { return Math.random(); }  // our own
  };
  SubMath.random.__proto__ = SuperMath.random;
  freshGlobal.Math = SubMath;

  // Do it separately last so it can overwrite what we wrote above
  Object.define(freshGlobal, endowments);
  return freshGlobal.eval(src);
}
```

We can likewise create patterns for endowing with
[virtualized emulations of expected host-provided globals](https://github.com/google/caja/blob/master/src/com/google/caja/plugin/domado.js),
like `window` and `document`, possibly mapping into the caller's own
or not.

Of course, the Compartments and Virtualized Powers patterns can be
composed, enabling one to *temporarily* invite potentially malicious
code onto one's page, endow it with a subtree of one's own DOM as
its virtual document, and then permanently and fully evict it.

### Mobile code

Map-Reduce frameworks vividly demonstrate the power of sending the
code to the data, rather than the data to the code. Flexible
distributed computing systems must be able to express both.

Now that `Function.prototype.toString` will give a reliably evaluable
string that can be sent (TODO link), SES provides a safe way for
the receiver to evaluate it, in order to reconsitute that function's
call behavior in a safe manner.

```js
class QPromise extends Promise {
  // ... api from https://github.com/kriskowal/q/wiki/API-Reference
  // All we actually use below is fcall
}

class RemotePromise extends QPromise {
  ...
  // callback must be a closed function
  there(callback, errback = void 0) {
    const callbackSrc = Function.prototype.toString(callback);
    // Assume farEval is a remote promise for the eval function of
    // the remote SES realm where this promise's fulfillment will be.
    // See https://github.com/kriskowal/q-connection
    const farCallback = farEval.fcall(callbackSrc);
    return farCallback.fcall(this).catch(errback);
  }
}
```

The familiar expression `Promise.resolve(p).then(callback)` postpones
the `callback` function to some future time after the promise `p` has
been fulfilled. In like manner, the expression
`RemotePromise.resolve(r).there(callback)` postpones and migrates the
closed `callback` function to some future time and space, where the
object designated by the fulfilled `r` is located. This supports a
federated form of the
[Asynchronous Partitioned Global Address Space](http://citeseerx.ist.psu.edu/viewdoc/summary?doi=10.1.1.464.557)
concurrency model used by the X10 supercomputer language.


## Annex B considerations

As of ES6, most of the normative optionals of
[Annex B](http://www.ecma-international.org/ecma-262/6.0/#sec-additional-ecmascript-features-for-web-browsers)
seem safe for inclusion as normative optionals of the proto SES
realm. However, where Annex B states that these are normative
mandatory in a web browser, there is no such requirement for SES. Even
when run in a web browser, the SES environment, having no host
specific globals, must be considered a non-browser environment. Note
that some post-ES6 APIs proposed for Annex B, such as the `RegExp`
statics (TODO need link) and the `Error.prototype.stack` accessor
property (TODO need link), are not safe for inclusion in SES and must
be absent.

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
[whitelisted in SES5](https://github.com/google/caja/blob/master/src/com/google/caja/ses/whitelist.js#L85)
for a long time without problem. (The last bullet above is syntax and
so not subject to the SES5 whitelisting mechanism.)

SES should probably mandate that `RexExp.prototype.compile` be absent,
since the observable mutations it causes are confusing. Alternatively,
in SES, perhaps it still exists to provide the implementation with
optimization advice but without causing observable mutation.

I have no idea what
[B.3.5](http://www.ecma-international.org/ecma-262/6.0/#sec-__proto__-property-names-in-object-initializers)
is about.


## How Deterministic?

_We do not include any form of replay within the goals of SES, so
this "How Deterministic" section is only important because of the
punch line at the end of this section._

Given a deterministic spec, one could be sure that two computations,
starting from the same state, run on two conforming implementations,
fed the same inputs, will compute the same new states and outputs. The
ECMAScript 5 and 6 specs come tantalizingly close to being
deterministic. They have avoided some common but unnecessary sources
of non-determinism like Java's `Object.hashCode`. But the EcmaScript
specs fail for three reasons:

  * Genuine non-determinism, such as by `Math.random()`.
  * Unspecified but unavoidable failure, such as out-of-memory.
  * Explicit underspecification, i.e. leaving some observable behavior
    up to the implementation.

The explicitly non-deterministic abilities to sense the current time
(via `Date()` and `Date.now()`) or generate random numbers (via
`Math.random()`) are disabled in the proto SES realm, and therefore by
default in each SES realm. New source of non-determinism, like
`makeWeakRef` and `getStack` will not be added to the proto SES realm
or will be similarly disabled.

The EcmaScript specs to date have never admitted the possibility of
failures such as out-of-memory. In theory this means that a conforming
EcmaScript implementation requires an infinite memory
machine. Unfortunately, these are in short supply ;) . Since
JavaScript is an implicitly-allocating language, the out-of-memory
condition could cause computation to fail at virtually any time. If
these failures are reported in a recoverable manner without rollback,
such as by a thrown exception (cite JVM), then defensive programming
becomes impossible. This would be contrary to the goals of at least
SES and indeed to much JavaScript code. (TODO link to SAB discussion
of containing failure.) Thus, at least SES computation, and any
synchronous computation it is entangled with, on unpredicatble errors,
must either be preemptively aborted without running further user code
(cite Erlang, Joe-E/Waterken) or roll back to a previous safe point
(cite Noether). If repeated attempts to roll forward from a safe point
fail, preemptive termination is inevitable.

Even if EcmaScript were otherwise deterministically replayable, these
unpredicable preemptive failures would prevent it. We examine instead
the weaker property of *fail-stop determinism*, where each replica
either fails, or succeeds in an identical manner as every other
non-failing replica.

Although they are few in number, there are a number of specification
issues that are observably left to implementations, on which
implementations differ. Some of these may eventually be closed by
future TC39 agreement, such as enumeration order if objects are
modified during enumeration (TODO link). Others, like the sort
algorithm used by `Array.prototype.sort` are less likely. However,
*implementatiion-defined* is not genuine non-determinism. On a given
implementation, operations which are only implementation-defined will
operate in the same manner. They should be fail-stop reproducible when
run on the same implementation. To make use of this for replay, we
would need to pin down what we mean by "same implementation", which
seems difficult.

### The punch line

However, even without pinning down the precise meaning of
"implementation defined", a computation which is limited to
fail-stop implementation-defined determinism _**cannot read covert
channels and side channels**_ that are not otherwise provided to
it. Nothing can practically prevent signalling on covert channels and
side channels, but approximations to determinism can practically
prevent confined computations from perceiving these signals.

(TODO explain the anthropic side channel and how it differs from an
information-flow termination channel.)


## Discussion

Because the proto SES realm is transitively immutable and
authority-free, we can safely share it between JS programs that are
otherwise fully isolated. This sharing gives them access to shared
objects and shared identities, but no ability to communicate with each
other or to affect any state outside themselves. We can even share
proto-SES primordials between origins and between threads, since deep
immutability at the specification level should make thread safety at
the implementation level straightforward.

In a browser environment, a SES-based confined seamless iframe could
be *very* lightweight, since it would avoid the need to create most
per-frame primordials. Likewise, we could afford to place each web
component (need link) into its own confinement box.

Today, to self-host builtins by writing them in JavaScript, one must
practice
[safe meta programming](http://wiki.ecmascript.org/doku.php?id=conventions:safe_meta_programming)
techniques so that these builtins are properly defensive. This
technique is difficult to get right, especially if such self hosting
is opened to browser extension authors (TODO need link). Instead,
these builtin could be defined in a SES realm, making defensiveness
easier to achieve with higher confidence.

Because of the so-called "[override mistake](
http://wiki.ecmascript.org/doku.php?id=strawman:fixing_override_mistake)",
for many or possibly all properties in this frozen state, primordial
objects need to be frozen in a pattern we call "tamper proofing",
which makes them less compliant with the current language
standard. Alternatively, we could specify that the override mistake is
fixed in the SES realm, making the problem go away. This diverges from
the current standard in a different way, but we have some evidence
that such divergence will break almost no existing code other than
test code that specifically probes for standards compliance.

By the rules above, a SES realm's `Function.prototype.constructor`
will be the proto-SES realm's `Function` constructor, i.e., identical
to the SES realm's `Function.__proto__`. Alternatively, we could
create a per-SES-realm `Function.prototype` that inherits from the
proto realm's `Function.prototype` and overrides the `constructor`
property to point back at its own `Function`. The price of this
technique is that we lose the pleasant property that `instanceof`
works transparently between SES realms.

In ES6, the `GeneratorFunction` evaluator is not a named global, but
rather an unnamed intrinsic. Upcoming evaluators are likely to include
`AsyncFunction` and `AsyncGeneratorFunction`. These are likely to be
specified as unnamed instrinsics as well. For all of these, the above
name-based overriding of SES vs proto-SES is irrelevant and probably
not needed anyway.

Because code within a SES realm is unable to cause any affects outside
itself it is not given explicit access to, i.e., it is fully confined,
`Reflect.confine` and the evaluators of SES realms should continue to
operate even in environments in which CSP has forbidden normal
evaluators. By analogy, CSP evaluator suppression does not suppress
`JSON.parse`. There are few ways in which SES-confined code is more
dangerous than JSON data. (TODO link to CSP discussions)

Other possible proposals, like private state and defensible `const`
classes, are likely to aid the defensive programming that is
especially powerful in the context of SES. But because the utility of
such defensive programming support is not limited to SES, they should
remain independent proposals. (TODO link to relevant proposals)

Currently, if the value of `eval` is anything other than the original
value of `eval`, any use of it in the form of a direct-eval expression
will actually have the semantics of an indirect eval, i.e., a simple
function call to the current value of `eval`. If SES itself does not
alter the behavior of the builtin evaluators to be strict by default,
then any user customization that replaces a SES realm's global
evaluators with strict-by-default wrappers will break their use for
direct-eval. We need to do something about this, but it is not yet
clear what.

For each of the upcoming proposed standard APIs that are not immutable
and authority-free:

  * `defaultLoader`
  * `global`
  * `makeWeakRef`
  * `getStack`
  * `getStackString`

(TODO link to proposals) they must be absent from the proto-SES realm,
or have their behavior grossly truncated into something safe. This
spec will additionally need to say how they initially appear, if at
all, in each individual SES realm.  In particular, we expect a pattern
to emerge for creating a fresh loader instance to be the default
loader of a fresh SES realm. Once some proposed APIs are specced as
being provided by import from builtin primordial modules, we will need
to explain how they appear in SES. (TODO link to discussion of
standardizing builtin modules)

Prior to standard builtin primordial modules,

```js
Reflect.confine(src, endowments)
```

is the *entirety* of the new API proposed here. We believe it is all
that is necessary. However, as we develop a better understanding of
patterns of use, we may wish to add other conveniences as well.
