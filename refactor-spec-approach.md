# Towards a better factoring of Ecma262

The purpose of the changes explained here are to prepare the ground for this SES proposal so that it can state its semantic changes more understandably.

All references to Ecma262 or The EcmaScript Specification, unless stated otherwise, are to [EcmaScript 2020](https://tc39.es/ecma262). This document outlines changes to its organization that should make no observable difference. As such, these would not be semantic changes, and so not need to go through the proposal approval process. However, they are substantial, and would result in a serious needs-consensus PR (pull request).


## Refactoring the original ModuleRecord abstractions

The [original ModuleRecord abstractions](https://tc39.es/ecma262/#sec-abstract-module-records) mix three concerns
  * The static information that corresponds to the separately linkable units of compilation. In the SourceTextModuleRecord example, this would be the information that could be derived from the source text of one module by itself, with no inter-module analysis. We separate these into ***StaticModuleRecord*** abstractions.
  * A ***ModuleInstance*** has a StaticModuleRecord and the additional state needed to have a fully linked and initialized stateful module instance. This corresponds most directly to the original ModuleRecord but is renamed to avoid confusion.
  * The ***ModuleInitialization*** bookkeeping needed during the instantiation and initialization of module instances, to take care of cycles, errors, phasing of initialization, etc.

We focus on refactoring the state of these abstractions. From the refactoring of the state, the relocation of the methods should often be obvious and may not be explicitly stated.

### StaticModuleRecord abstractions

The original abstract ModuleRecord has no static slots or methods relevant to the static records. For parallelism, we still define the abstract ***StaticModuleRecord*** as an empty supertype of the other StaticModuleRecord types.

The ***CyclicStaticModuleRecord*** is a StaticModuleRecord with the slot
  * [[RequestedModules]] : `List of String`

and no methods.

The ***SourceTextStaticModuleRecord*** is a CyclicStaticModuleRecord. It additionally holds the static information from the [original SourceTextModuleRecord](https://tc39.es/ecma262/#sourctextmodule-record). It has the slots
  * [[ECMAScriptCode]] : `ParseNode`
  * [[ImportEntries]] : `List of ImportEntry` records
  * [[LocalExportEntries]] : `List of ExportEntry` records
  * [[IndirectExportEntries]] : `List of ExportEntry` records
  * [[StarExportEntries]] : `List of ExportEntry` records

### ModuleInstance

A ***ModuleInstance*** has the slot
  * [[StaticModuleRecord]] : `StaticModuleRecord` as specified above

and the following [original ModuleRecord](https://tc39.es/ecma262/#sec-abstract-module-records) slots
  * [[EvalRecord]] : `EvalRecord`. This is just a renaming of the [[Realm]] slot from the original ModuleRecord. Below, the original RealmRecord is refactored into the EvalRecord.
  * [[Environment]] : `LexicalEnvironment`, which is unchanged
  * [[Namespace]] : `ModuleNamespace` exotic object, which is unchanged
  * [[HostDefined]] : `Any`, which is unchanged

It has no slots from the original CyclicModuleRecord or SourceTextModuleRecord.

### ScriptInstance

For parallelism, we rename the [original ScriptRecord](https://tc39.es/ecma262/#sec-script-records) to ***ScriptInstance*** and reorder the slots to
  * [[ECMAScriptCode]] : `ParseNode`, unchanged.
  * [[EvalRecord]] : `EvalRecord`, renamed from the original [[Realm]]
  * [[Environment]] : `LexicalEnvironment`, unchanged
  * [[HostDefined]] : `Any`, unchanged

A ***referrer*** can be a ModuleInstance, ScriptInstance, or null.

### ModuleInitialization

We separate into a distinct ***ModuleInitialization*** object the bookkeeping needed to guide module instantiation, linking, initialization, etc. Thus, once the initialization process completes, this bookkeeping state is no longer present. This helps us reason about post-initialization state separately.

A ***ModuleInitialization*** has the slots
  * [[ModuleInstance]] : `ModuleInstance` being initialized

It has the following [original CyclicModuleRecord](https://tc39.es/ecma262/#sec-cyclic-module-records) slots.
  * [[Status]] unchanged
  * [[EvaluationError]] unchanged
  * [[DFSIndex]] unchanged
  * [[DFSAncestorIndex]] unchanged

It has the original SourceTextModuleRecord slot
  * [[Context]] : `ExecutionContext`, an ECMAScript [execution context](https://tc39.es/ecma262/#sec-execution-contexts), which is only used during module initialization. Unchanged.

## Refactoring the original RealmRecord into the EvalRecord

Currently, this is mostly a renaming. EvalRecords will be 1-to-1 with Compartments, and so there will be multiple EvalRecords per realm. EvalRecord isn't a great name, but it'll do.

An ***EvalRecord*** has the following [original RealmRecord](https://tc39.es/ecma262/#sec-code-realms) slots
  * [[Intrinsics]] : `Record` of all the intrinsics shared by all compartments in this Realm. Unchanged.
  * [[GlobalObject]] : `Object`, the global object for this compartment. Unchanged
  * [[GlobalEnv]] : `LexicalEnvironment`, for code executing in this compartment. Unchanged.
  * [[TemplateMap]] : `List of {[[Site]], [[Array]]}` records. Unchanged.
  * [[HostDefined]] : `Any`, unchanged.

It has the following hook functions, which were originally provided only by the host. By making these per-EvalRecord, their behavior can come from user-provided functions specific to that EvalRecord. This enables ECMAScript code to act as host to other ECMAScript code. When their behavior comes from user-provided functions, the hook functions below wrap this to coerce, validate, and memoize so the hook function is always correctly typed on success, and always gives consistent answers. Thus the hook functions, on success, satisfy the invariants of the [original host hook functions](https://tc39.es/ecma262/#sec-hostresolveimportedmodule).

  * [[ResolveImportedModule]] : `(referrer, specifier) -> ModuleInstance`, from the [original HostResolveImportedModule](https://tc39.es/ecma262/#sec-hostresolveimportedmodule). This is like the `importer` function from [make-importer](https://github.com/Agoric/make-importer), but synchronous?
  * [[ImportModuleDynamically]] : `(referrer, specified) -> Promise<ModuleInstance>`, from the [original HostImportModuleDynamically](https://tc39.es/ecma262/#sec-hostimportmoduledynamically). But rather than take a spec-internal "PromiseCapability" as argument, it returns a promise. This is like the `importer` function from [make-importer](https://github.com/Agoric/make-importer).
  * [[ResolveImportMeta]] : `(referrer) -> Object | undefined`. This replaces the ModuleInstance.Meta property from the original [import.meta](https://tc39.es/proposal-import-meta/) proposal

---

# Random notes

Other host hooks to be aware of
  * The [original InitializeHostDefinedRealm](https://tc39.es/ecma262/#sec-initializehostdefinedrealm) has to be broken up to separate creating a per-Realm set of intrinsics vs per-EvalRecord state.
  * The [original HostReportErrors](https://tc39.es/ecma262/#sec-host-report-errors), probably needs to be hookable at the [Agent](https://tc39.es/ecma262/#sec-agents) level, rather than EvalRecord or Realm levels.
  * The [original HostEnsureCanCompileStrings](https://tc39.es/ecma262/#sec-hostensurecancompilestrings), should turn into an EvalRecord hook.
  * The [original HostHasSourceTextAvailable](https://tc39.es/ecma262/#sec-hosthassourcetextavailable). Unclear how to handle.
  * [RunJobs](https://tc39.es/ecma262/#sec-runjobs) and [Job scheduling decisions](https://tc39.es/ecma262/#sec-jobs-and-job-queues), should turn into Agent-level hooks.
  * [HostPromiseRejectionTracker](https://tc39.es/ecma262/#sec-host-promise-rejection-tracker) agent-level hook.
  * [debugger](https://tc39.es/ecma262/#sec-debugger-statement-runtime-semantics-evaluation) has an implementation-defined completion value. Cool!
  * [Directive Prologues](https://tc39.es/ecma262/#sec-directive-prologues-and-the-use-strict-directive) should probably only have a static meaning, but it is intriguing. The recommended warning behavior could become a parse-time hook.
  * [DetachArrayBuffer](https://tc39.es/ecma262/#sec-detacharraybuffer) can be called only by hosts.


From [Proxy internals](https://tc39.es/ecma262/#sec-proxy-object-internal-methods-and-internal-slots):
  An ECMAScript implementation must be robust in the presence of all possible invariant violations.

The [Global Object](https://tc39.es/ecma262/#sec-global-object) has an implementation dependent [[Prototype]]. WTF?

[URI handling](https://tc39.es/ecma262/#sec-uri-handling-functions) says "Many implementations of ECMAScript provide additional functions and methods that manipulate web pages". What?

[toLocale](https://tc39.es/ecma262/#sec-number.prototype.tolocalestring) is, of course, implementation dependent. Must be hooked at the realm-level. Also the other toLocaleString methods.

[BigInt.prototype.toString](https://tc39.es/ecma262/#sec-bigint.prototype.tostring) is implementation-dependent? WTF?

[Math](https://tc39.es/ecma262/#sec-function-properties-of-the-math-object) is implementation-dependent, but recommends [fdlibm](http://www.netlib.org/fdlibm).

[Date LocalTZA](https://tc39.es/ecma262/#sec-local-time-zone-adjustment) is implementation dependent, of course.

[timeZoneString](https://tc39.es/ecma262/#sec-timezoneestring) says "an implementation-dependent timezone name". Oh, come on!

[Date.parse](https://tc39.es/ecma262/#sec-date.parse) for non-conforming strings.

[Array.prototype.sort](https://tc39.es/ecma262/#sec-array.prototype.sort) and [TypedArray.prototype.sort](https://tc39.es/ecma262/#sec-%typedarray%.prototype.sort) algorithms.

[Pattern](https://tc39.es/ecma262/#sec-pattern) says "except for any host-defined exceptions that can occur anywhere such as out-of-memory".

[document.all](https://tc39.es/ecma262/#sec-IsHTMLDDA-internal-slot) bleh
