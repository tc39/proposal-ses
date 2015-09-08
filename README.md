# Draft Proposed Standard SES

See [Glossary](https://github.com/FUDCo/ses-realm/wiki/Glossary) for
supporting definitions.


## Background:

SES -- Secure EcmaScript -- is an object capability (ocap) secure subset of the
EcmaScript (JavaScript) programming language.  SES turns a conventional ES5 or
ES6 environment into an ocap environment by imposing various restrictions prior
to any code being allowed to run.  These restrictions support the writing of
defensively consistent abstractions -- object abstractions that can defend
their integrity while being exposed to untrusted but confined objects.
Although programs are limited to a subset of the full EcmaScript language, SES
should compatibly run all ES5 or ES6 code that follows recognized ES best
practices. In fact, many features of ES5 were introduced specifically to enable
precisely this subsetting and restriction, so that we can realize a secure
computing environment for JavaScript.  SES was developed as part of the Google
[Caja](https://github.com/google/caja) project; you can read much more about
SES specifically and Caja more generally on the Caja website.


## Problem statement:

SES is currently implemented as a bundle of preamble code that is the first
thing run on an SES-enabled web page.  To turn a JS environment into an ocap
environment, this SES implementation must freeze all primordial objects --
objects like `Array.prototype` -- that are mandated to exist before any code
starts running. The time it takes to walk and freeze all these makes the
initial page load expensive, which has inhibited SES adoption. With the advent
of ES6, the number of primordials balloons, so realizing SES purely as a
library will become even more expensive. We are quickly approaching the time
when we can no longer postpone proposing SES to be a standard part of the
platform.


## Proposal:

  1. Create a single shared SES realm (global scope and set of
     primordial objects) in which all primordials are already transitively
     immutable and authority-free. It doesn't matter if this SES realm
     is populated immediately or lazily, as long as there is no
     observable difference. Unlike current SES, in this one shared SES
     realm the global object itself is also transitively immutable and
     authority-free.

  1. Adopt the
     [`Reflect.Loader`](https://whatwg.github.io/loader/#loader-constructor)
     constructor into the ES spec and include it in the immutable
     primordials above. Each call (or `new`) of the frozen
     `Reflect.Loader` creates a new mutable loader instance, born
     isolated from all other such mutable loaders constructed by that
     constructor.

  1. Unspecified constructs that introduce non-local causality or other holes,
     like sloppy `.caller` continue to be omitted from the de jure language
     standard. However, rather than just omit them, the SES realm definition
     mandates their absence.

  1. Other than the defining constraints above, this single shared SES
     realm is in almost[*] all other ways fully conformant to ES6 and
     future specs -- requiring only that those future specs not introduce any
     holes that are pluggable by the above constraints alone.
     

[*] Because the so-called "[override mistake](
http://wiki.ecmascript.org/doku.php?id=strawman:fixing_override_mistake)", for
many or possibly all properties in this frozen state, primordial objects need
to be frozen in a pattern we call "tamper proofing", which makes them less
compliant with the current langauge standard. Alternatively, we could specify
that the override mistake is fixed in the SES realm, making the problem go
away. This diverges from the current standard in a different way, but we have
some evidence that such divergence will break almost no existing code other
than test code that specifically probes for standards compliance.


## Some surprises:

Because the SES realm is transitively immutable and authority-free, we
can safely share it between JS programs that are otherwise fully
isolated. This sharing gives them access to shared objects and shared
identities, but no ability to communicate with each other.

Because it is a single SES realm with a single set of object
identities, if two clients *do* come to be in contact by other means,
two independently created object subgraphs would have none of the
interoperability problems that objects from different realms have,
such as `arr instanceof Array` not working because `arr` is an array
from another realm.

Since it is transitively immutable, once it is fully initialized it is
even thread safe, and so could be also shared by workers in the same
address space.

Because `eval` and the `Function` constructor (and now the
`GeneratorFunction` constructor) evaluate code in the global
environment, freezing the global object means that they are now
safe. The SES spec no longer has to define a subset of their behavior.
