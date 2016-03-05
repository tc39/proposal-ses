# Draft Proposed Standard SES

See [Glossary](https://github.com/FUDCo/ses-realm/wiki/Glossary) for
supporting definitions.


## Background:

SES -- Secure EcmaScript -- is an object capability (ocap) secure
subset of the EcmaScript (JavaScript) programming language.  SES turns
a conventional ES5 or ES6 environment into an ocap environment by
imposing various restrictions prior to any code being allowed to run.
These restrictions support the writing of defensively consistent
abstractions -- object abstractions that can defend their integrity
while being exposed to untrusted but confined objects.  Although
programs are limited to a subset of the full EcmaScript language, SES
should compatibly run all ES5 or ES6 code that follows recognized ES
best practices. In fact, many features of ES5 were introduced
specifically to enable precisely this subsetting and restriction, so
that we can realize a secure computing environment for JavaScript.
SES was developed as part of the Google
[Caja](https://github.com/google/caja) project; you can read much more
about SES specifically and Caja more generally on the Caja website.


## Problem statement:

SES is currently implemented as a bundle of preamble code that is the
first thing run on an SES-enabled web page.  To turn a JS environment
into an ocap environment, this SES implementation must freeze all
primordial objects -- objects like `Array.prototype` -- that are
mandated to exist before any code starts running. The time it takes to
walk and freeze all these makes the initial page load expensive, which
has inhibited SES adoption. With the advent of ES6, the number of
primordials balloons, so realizing SES purely as a library will become
even more expensive. We are quickly approaching the time when we can
no longer postpone proposing SES to be a standard part of the
platform.


## Proposal:

  1. Create a single shared **proto-SES realm** (global scope and set
     of primordial objects) in which all primordials are already
     transitively immutable and authority-free. Unlike the SES realms
     we define below, in this one shared proto-SES realm the global
     object itself is also transitively immutable and
     authority-free. These primordials include *all* the primordials
     defined as mandatory in ES6 and all those defined by later
     ratified ECMAScript specs unless stated otherwise. These
     primordials include no other objects or properties beyond those
     specified here. Specifically, it contains no host-specific
     objects. The global object is a plain object.

  1. As a consequence of the deep immutability of the proto-SES realm:
     When performed using the proto-SES realm's `Date` and `Math`, the
     expressions `new Date()`, `Date.now()`, and `Math.random()` all
     throw a to-be-specified error.

  1. Add to all realms including the shared proto-SES realm a new
     builtin function `Reflect.confine(src, endowments)`, which
     creates a new **SES realm** with its own fresh global
     object. This fresh global object is populated with overriding
     bindings for `Date`, `Math`, and the evaluators: `eval`,
     `Function`, `GeneratorFunction` etc..., binding each of these
     globals to fresh objects that inherit from the corresponding
     objects from proto-SES realm. It then copies the own enumerable
     properties from `endowments` onto this global, evaluates `src` as
     if by `freshGlobal.eval(src)`, and returns the result.

  1. The evaluators of the proto-SES realm evaluate code in the global
     scope of the proto-SES realm, using the proto-SES realm's frozen
     global as their global object. The initial evaluators specific to
     a SES realm evaluate code in the global scope of that SES realm,
     using that realm's global object as their global object.

  1. The expression `Reflect.confine('this', {})` therefore simply
     creates a fresh global for a new SES realm, populates it with its
     own overriding evaluators, `Date`, and `Math`, but otherwise uses
     the globals from the proto-SES realm, and returns that new
     global. Thus, one can obtain and fully customize the global of a
     new SES realm before running confined code in that realm by
     `freshGlobal.eval(src)`.

  1. A SES realm's initial `eval` inherits from proto-SES's
     `eval`. `Date` inherits from proto SES's Date, etc. The
     overriding `Date` has its own `now`. The overriding `Math` has
     its own `random`. For each of the overriding constructors, their
     `prototype` is the same as the constructor they inherit
     from. Thus, a date object made by `new Date()` in one SES realm
     passes the `date instanceof Date` test using the `Date`
     constructor of another SES realm, etc. Among SES realms,
     `instanceof` on primordial types simply works.

## Discussion

Because the so-called "[override mistake](
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
will be the proto-SES realms `Function` constructor, i.e., identical
to the SES realm's `Function.__proto__`. Alternatively, we could
create a per-SES-realm `Function.prototype` that inherits from the
proto realm's `Function.prototype` and overrides the constructor to
point back at its own `Function`. The price of this technique is that
we lose the pleasant property that `instanceof` works transparently
between SES realms.

Because the proto SES realm is transitively immutable and
authority-free, we can safely share it between JS programs that are
otherwise fully isolated. This sharing gives them access to shared
objects and shared identities, but no ability to communicate with each
other or to affect any state outside themselves they are not
explicitly given access to. We can even share it between origins and
between threads, since specification-immutability makes
implementation-thread-safety straightforward.

Because code within a SES realm is unable to cause any affects outside
itself is it not given explicit access to, i.e., it is fully confined,
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

For each of the upcoming proposed standard APIs that are not immutable
and authority-free:

  * defaultLoader
  * global
  * makeWeakRef
  * getStack
  * getStackString


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
