# Generation quality and efficiency

Approved scope: implement the improvements in the October 7 project review locally.

Keep Node 20+, vanilla JS, CommonJS, Playwright, the local CLI providers, and existing run/review safety boundaries. No new product dependencies or cloud publication.

Generation will use a dedicated provider adapter, quality validator, and cancellable job service. The synchronous endpoint remains compatible. Optional context fields describe acceptance criteria, role, preconditions, data, and rules. Criteria become stable R1… IDs; without explicit criteria the entire free-text requirement is R1, avoiding invented business rules. Mapping is reported separately from verified coverage.

Reject blank expected results and manual steps. References must resolve to the supplied catalog on new generation. Flag likely duplicate scenarios; do not discard subtly different cases. Prompts enumerate supported assertions and require alignment with the expected outcome, while honestly retaining human semantic review. Unknown facts become explicit blockers.

Inspection caches anonymous exact-URL observations for five minutes (bounded to 20 entries), with explicit refresh. Inspection failure yields manual cases and blocked automation. Additional user-captured same-origin states are bounded, expire, and include manual setup instructions. Their existence never proves that generated automation reaches them. Secrets remain outside prompts. Relevant controls are ranked with form scopes retained; truncation is disclosed.

Generate design and operation mapping in one request. Validate cases independently. At most one repair request targets only invalid cases; accepted cases remain untouched. A second invalid mapping may become blocked if its manual case is valid; invalid manual cases are omitted with explicit warnings. No successful suite without a valid case. Repair never changes expected results to make execution pass.

Selected regeneration uses the saved inputs and optimistic revision checks; unchanged case identities, content, and review state are preserved. Replaced cases become drafts; no old run is attributed to a new revision. Jobs provide stages and metrics, cancel the CLI process group, and are bounded to two running jobs and 100 retained jobs. Cancellation/revision conflicts cannot save late results. UI reconnects to in-memory jobs; restart is an explicit unavailable state.

Benchmark fixtures cover explicit requirements, missing context, duplicates, invalid mappings, and assertion types. Deterministic checks are not proof of real-model quality; an opt-in live benchmark records timings and outputs for human review.
