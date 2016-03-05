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
     primordials must include no other objects or properties beyond
     those specified here. Specifically, it contains no host-specific
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

## Annex B considerations

As of ES6, most of the normative optionals of
[Annex B](http://www.ecma-international.org/ecma-262/6.0/#sec-additional-ecmascript-features-for-web-browsers)
seem safe for inclusion as normative optionals of the proto SES
realm. However, where Annex B states that these are normative
mandatory in a web browser, there is no such requirement for SES. Even
when run in a web browser, the SES environment, having no host
specific globals, is not considered to be a JavaScript browser
environment. Note that some post-ES6 APIs proposed for Annex B, such
as the `RegExp` statics (TODO need link) and the
`Error.prototype.stack` accessor property, are not safe for inclusion
in SES and must be absent.

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

## Discussion

Because the proto SES realm is transitively immutable and
authority-free, we can safely share it between JS programs that are
otherwise fully isolated. This sharing gives them access to shared
objects and shared identities, but no ability to communicate with each
other or to affect any state outside themselves they are not
explicitly given access to. We can even share it between origins and
between threads, since immutability at the specification level should
make thread safety at the implementation level straightforward.

In a browser environment, a SES-based confined seamless iframe could
be *very* lightweight, since it would avoid the need to create most
per-frame primordials. Likewise, we could afford to place each web
component (need link) into its own confinement box.

Self-hosting builtins, including new browser extensions (TODO need
link), by writing them in JavaScript currently requires
[safe meta programming](http://wiki.ecmascript.org/doku.php?id=conventions:safe_meta_programming)
techniques so that these builtins are properly defensive. Instead,
they could be defined in a SES realm, making defensiveness much easier
to achieve, and with much higher confidence.

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
