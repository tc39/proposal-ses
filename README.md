# Draft Proposed Standard SES

See [Glossary](https://github.com/FUDCo/ses-realm/wiki/Glossary) for
supporting definitions.


## Background:

To turn a JS environment into an ocap environment, SES must freeze all
primordial objects -- objects like `Array.prototype` -- that are
mandated to exist before any code starts running. The time it takes to
walk and freeze all these already makes initial page load expensive,
which significantly inhibits SES adoption. With ES6, the number of
primordials balloons, so SES purely as a library will become more
expensive. We are quickly approaching the time when we can no longer
postpone proposing SES to be a standard part of the platform.



## Proposal:

  1. Create a single shared SES realm (global scope and set of
     primordials) in which all primordials are already transitively
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

  1. Unspecified constructs that introduce non-local causality or
     other holes, like sloppy `.caller` continue to be omitted from
     the de jure standard. Rather than just omit them, the SES realm
     mandates their absence.

  1. Other than the defining constraints above, this single shared SES
     realm is in almost[*] all other ways fully conformant to ES6 and
     future specs -- requiring those future specs not to introduce any
     holes that are not plugged by the above constraints alone.
     

[*] Because the so-called the [override mistake](
http://wiki.ecmascript.org/doku.php?id=strawman:fixing_override_mistake),
for many or possibly all properties in this frozen state, they need to
be frozen in a pattern we call "tamper proofing" which makes them less
standards compliant. Alternatively, we could specify that the override
mistake is fixed in the SES realm, making the problem go away. This is
non-standards compliant in a different way, but we have some evidence
that this divergence will break almost nothing other than test code.



## Some surprises:

Because the SES realm is transitively immutable and authority-free, we
can safely share it between JS programs that are otherwise fully
isolated. This sharing gives them access to shared objects and shared
identities, but no abilities to communicate with each other.

Because it is a single SES realm with a single set of object
identities, if two clients do come to be in contact by other means,
two independently created subgraphs would have none of the
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
