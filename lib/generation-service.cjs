const { randomUUID } = require("node:crypto");
const {
  catalogFor,
  normalizeContext,
  assessCases,
  buildPrompt,
} = require("./generation-quality.cjs");
const fail = (message, status = 400) =>
  Object.assign(new Error(message), { status });
function validateInput(input) {
  if (
    !input ||
    typeof input.requirements !== "string" ||
    !input.requirements.trim() ||
    input.requirements.length > 20000
  )
    throw fail("Enter requirements using at most 20,000 characters.");
  if (!["plain", "bdd"].includes(input.format))
    throw fail("Choose BDD or plain text.");
  if (!["codex", "claude"].includes(input.provider))
    throw fail("Choose Codex CLI or Claude CLI.");
  if (
    !Array.isArray(input.frameworks) ||
    input.frameworks.some((f) => !["playwright", "cypress"].includes(f)) ||
    new Set(input.frameworks).size !== input.frameworks.length
  )
    throw fail("Choose distinct supported frameworks.");
  if (input.frameworks.length) {
    try {
      const url = new URL(input.targetUrl);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password
      )
        throw Error();
    } catch {
      throw fail("Enter a valid HTTP(S) target URL without credentials.");
    }
  }
  input.context = normalizeContext(input.context);
  if (
    input.pageStateIds !== undefined &&
    (!Array.isArray(input.pageStateIds) ||
      input.pageStateIds.length > 10 ||
      input.pageStateIds.some(
        (id) => typeof id !== "string" || id.length > 100,
      ) ||
      new Set(input.pageStateIds).size !== input.pageStateIds.length)
  )
    throw fail("Choose at most 10 distinct captured states.");
  if (
    input.refreshInspection !== undefined &&
    typeof input.refreshInspection !== "boolean"
  )
    throw fail("Refresh inspection must be a boolean.");
  catalogFor(input);
  return input;
}
function createGenerationService({
  suiteStore,
  saveSuite,
  inspect,
  callProvider,
  getStates = () => [],
  now = () => Date.now(),
  cacheTtlMs = 300000,
  deadlineMs = 300000,
}) {
  const jobs = new Map(),
    cache = new Map();
  let active = 0,
    closing = false;
  function prepare(raw) {
    const input = structuredClone(raw);
    let base = null;
    if (input?.regenerate) {
      const r = input.regenerate;
      base = suiteStore.getSuite(r.suiteId);
      if (!base) throw fail("Suite not found.", 404);
      if (base.revision !== r.expectedRevision)
        throw fail("Suite revision does not match.", 409);
      if (
        !Array.isArray(r.caseIds) ||
        !r.caseIds.length ||
        r.caseIds.length > 8 ||
        new Set(r.caseIds).size !== r.caseIds.length ||
        r.caseIds.some((id) => !base.cases.some((c) => c.caseId === id))
      )
        throw fail("Choose distinct cases from this suite.");
      const pageStateIds = input.pageStateIds;
      Object.assign(input, base.generationInput, {
        targetUrl: base.targetUrl,
        provider: input.provider || base.provider,
        regenerate: r,
        ...(pageStateIds !== undefined ? { pageStateIds } : {}),
      });
      if (!input.requirements?.trim())
        throw fail(
          "Demo and legacy suites need real requirements before regeneration.",
        );
    }
    validateInput(input);
    const states = getStates(input.pageStateIds || [], input.targetUrl);
    return { input, base, states };
  }
  function publicJob(job) {
    return structuredClone({
      generationId: job.id,
      status: job.status,
      stage: job.stage,
      createdAt: job.createdAt,
      finishedAt: job.finishedAt,
      metrics: job.metrics,
      error: job.error,
      suite: job.suite,
    });
  }
  function check(job) {
    if (job.controller.signal.aborted)
      throw fail(
        job.cancelReason || "Generation canceled.",
        job.cancelReason ? 502 : 499,
      );
  }
  async function run(job, { input, base, states }) {
    const started = now(),
      warnings = [];
    let inspection = null;
    const metrics = job.metrics;
    function assess(output) {
      if (
        output &&
        typeof output === "object" &&
        Array.isArray(output.cases) &&
        output.cases.length
      ) {
        if (
          Object.keys(output).some(
            (key) => !["schemaVersion", "cases"].includes(key),
          )
        )
          warnings.push(
            "Extra response metadata was ignored; original cases and expected outcomes were retained.",
          );
        if (output.cases.length > 8)
          warnings.push(
            "Provider exceeded eight cases; only the first eight were considered. Check unmapped requirements.",
          );
        return assessCases(
          { schemaVersion: 2, cases: output.cases.slice(0, 8) },
          input,
        );
      }
      return assessCases(output, input);
    }
    const elapsed = (key) => {
      const t = now();
      return () => {
        metrics[key] += Math.max(0, now() - t);
      };
    };
    const invoke = async (prompt) => {
      check(job);
      const end = elapsed("aiMs");
      try {
        return await callProvider(prompt, input, {
          signal: job.controller.signal,
          timeoutMs: Math.max(1, deadlineMs - (now() - started)),
        });
      } finally {
        end();
        check(job);
      }
    };
    const timer = setTimeout(() => {
      job.cancelReason = "Generation exceeded its five-minute deadline.";
      job.controller.abort();
    }, deadlineMs);
    timer.unref?.();
    try {
      if (input.frameworks.includes("playwright")) {
        job.stage = "inspection";
        const end = elapsed("inspectionMs");
        try {
          const key = input.targetUrl;
          const cached = cache.get(key);
          if (
            !input.refreshInspection &&
            cached &&
            now() - cached.at < cacheTtlMs
          ) {
            inspection = structuredClone(cached.value);
            metrics.cacheHit = true;
          } else {
            inspection = await inspect(input.targetUrl, {
              signal: job.controller.signal,
            });
            check(job);
            if (cache.size >= 20) cache.delete(cache.keys().next().value);
            cache.set(key, { at: now(), value: structuredClone(inspection) });
          }
        } catch (error) {
          check(job);
          warnings.push(
            "Page inspection unavailable. Manual cases remain available; automation is blocked without observed controls.",
          );
        } finally {
          end();
        }
      }
      check(job);
      job.stage = "generating";
      let prompt = buildPrompt(input, inspection, states);
      const ids = input.regenerate?.caseIds;
      if (ids)
        prompt +=
          "\nRegenerate ONLY these cases. Return one case per supplied caseId using that caseId as key. Preserve intent and expected business outcome; do not weaken assertions to make a test pass. Other cases must not be returned. " +
          JSON.stringify(
            base.cases
              .filter((c) => ids.includes(c.caseId))
              .map((c) => ({
                caseId: c.caseId,
                title: c.title,
                preconditions: c.preconditions,
                steps: c.steps,
                expected: c.expected,
                requirementRef: c.requirementRef,
              })),
          );
      let raw = await invoke(prompt);
      job.stage = "validating";
      let end = elapsed("validationMs");
      let assessment;
      try {
        assessment = assess(raw);
      } catch (error) {
        assessment = {
          valid: [],
          invalid: [],
          wholeError:
            raw?.invalidResponse === true
              ? "The previous answer did not contain a JSON object with a cases list. Return only that JSON object."
              : error.message,
        };
      }
      if (ids && !assessment.wholeError) {
        const byKey = new Map();
        for (const entry of [...assessment.valid, ...assessment.invalid]) {
          const key = entry.item?.key || entry.item?.caseKey;
          if (ids.includes(key) && !byKey.has(key)) byKey.set(key, entry);
        }
        assessment.valid = assessment.valid.filter((e) =>
          ids.includes(e.item.key || e.item.caseKey),
        );
        assessment.invalid = assessment.invalid.filter((e) =>
          ids.includes(e.item?.key || e.item?.caseKey),
        );
        for (const id of ids)
          if (!byKey.has(id))
            assessment.invalid.push({
              index: ids.indexOf(id),
              item: { key: id },
              manualValid: false,
              error: "Missing selected case.",
            });
      }
      metrics.acceptedWithoutRepair = assessment.valid.length;
      end();
      if (assessment.wholeError || assessment.invalid.length) {
        job.stage = "repairing";
        metrics.repairCount = 1;
        const repairPrompt =
          prompt +
          "\nRepair only the invalid cases below. Return {schemaVersion:2,cases:[...]} using their original keys. Do not return accepted cases. Preserve every supplied nonempty expected result and original scenario; fix structure, references and unsupported automation only. If automation cannot express the outcome, mark it blocked. " +
          JSON.stringify(
            assessment.wholeError
              ? { error: assessment.wholeError }
              : {
                  invalid: assessment.invalid.map((e) => ({
                    index: e.index,
                    item: e.item,
                    error: e.error,
                  })),
                },
          );
        let repaired;
        try {
          repaired = await invoke(repairPrompt);
        } catch (error) {
          check(job);
          warnings.push(
            "Repair request failed; valid original cases were retained.",
          );
        }
        job.stage = "validating";
        end = elapsed("validationMs");
        if (assessment.wholeError) {
          try {
            assessment = assess(repaired);
          } catch {
            throw fail(
              "No valid cases were returned after one repair attempt.",
              502,
            );
          }
        } else {
          let repairs = [];
          try {
            repairs = assess(repaired).valid;
          } catch {
            /* Original valid cases are retained. */
          }
          const stillInvalid = [];
          for (const original of assessment.invalid) {
            const key = original.item?.key || original.item?.caseKey;
            const replacement = repairs.find(
              (e) => (e.item.key || e.item.caseKey) === key,
            );
            if (
              replacement &&
              (typeof original.item?.expected !== "string" ||
                !original.item.expected.trim() ||
                replacement.item.expected === original.item.expected)
            )
              assessment.valid.push({ ...replacement, index: original.index });
            else stillInvalid.push(original);
          }
          assessment.invalid = stillInvalid;
        }
        end();
      }
      for (const invalid of assessment.invalid) {
        if (invalid.manualValid) {
          const c = invalid.item;
          assessment.valid.push({
            index: invalid.index,
            item: {
              key: c.key || c.caseKey || `recovered-${invalid.index}`,
              title: c.title,
              preconditions: c.preconditions,
              steps: c.steps,
              expected: c.expected,
              requirementRef: c.requirementRef,
              automation: Object.fromEntries(
                input.frameworks.map((f) => [
                  f,
                  {
                    status: "blocked",
                    reason:
                      "Automation needs manual correction: " + invalid.error,
                  },
                ]),
              ),
            },
          });
          warnings.push(
            `Case ${invalid.index + 1}: valid manual case retained with blocked automation.`,
          );
        } else
          warnings.push(`Case ${invalid.index + 1} omitted: ${invalid.error}`);
      }
      let cases = assessment.valid
        .sort((a, b) => a.index - b.index)
        .map((e) => e.item);
      if (ids) {
        cases = ids
          .map((id) => cases.find((c) => (c.key || c.caseKey) === id))
          .filter(Boolean);
        if (cases.length !== ids.length)
          throw fail(
            "Selected regeneration was incomplete. The original suite was preserved.",
            502,
          );
      }
      if (
        ids &&
        cases.some(
          (c) =>
            c.expected !==
            base.cases.find(
              (previous) => previous.caseId === (c.key || c.caseKey),
            ).expected,
        )
      )
        throw fail(
          "Regeneration changed an expected outcome. The original suite was preserved.",
          502,
        );
      if (!cases.length)
        throw fail("No valid cases remain after one repair attempt.", 502);
      // Keys are response-local mapping IDs, never executable identifiers.
      const unique = new Set();
      cases = cases.map((c, i) => {
        let key = c.key || c.caseKey;
        if (
          typeof key !== "string" ||
          !key.trim() ||
          key.length > 160 ||
          unique.has(key)
        )
          key = `recovered-${i}`;
        while (unique.has(key)) key += "x";
        unique.add(key);
        return { ...c, key, caseKey: undefined };
      });
      cases = cases.map(({ caseKey, ...c }) => c);
      if (
        input.frameworks.length &&
        !inspection?.controls?.length &&
        !states.some((s) => s.controls?.length)
      ) {
        cases = cases.map((c) => ({
          ...c,
          automation: Object.fromEntries(
            input.frameworks.map((f) => [
              f,
              {
                status: "blocked",
                reason:
                  "No page controls were observed. Review manual steps and capture the required page state.",
              },
            ]),
          ),
        }));
      }
      check(job);
      job.stage = "saving";
      metrics.totalMs = Math.max(0, now() - started);
      const generation = {
        metrics: { ...metrics },
        warnings,
        createdAt: new Date().toISOString(),
      };
      const suiteInput = {
        ...input,
        requirementCatalog: catalogFor(input),
        generation,
      };
      let suite;
      if (base) {
        const fresh = suiteStore.createSuite(
          { schemaVersion: 2, cases },
          suiteInput,
          { register: false },
        );
        check(job);
        suite = suiteStore.replaceCases(
          base.suiteId,
          base.revision,
          Object.fromEntries(ids.map((id, i) => [id, fresh.cases[i]])),
          { generation, pageStateIds: input.pageStateIds || [] },
          { persist: saveSuite },
        );
      } else
        suite = suiteStore.createSuite(
          { schemaVersion: 2, cases },
          suiteInput,
          { persist: saveSuite },
        );
      job.suite = suite;
      job.status = "completed";
      job.stage = "completed";
    } catch (error) {
      job.status =
        job.controller.signal.aborted && !job.cancelReason?.includes("deadline")
          ? "canceled"
          : "failed";
      job.error = error.message;
      job.errorStatus = error.status || 502;
      job.stage = job.status;
    } finally {
      clearTimeout(timer);
      metrics.totalMs = Math.max(0, now() - started);
      job.finishedAt = new Date().toISOString();
      active--;
    }
  }
  function start(raw) {
    if (closing) throw fail("Generation service is shutting down.", 503);
    if (active >= 2)
      throw fail(
        "Generation is busy. Wait for a current request to finish.",
        429,
      );
    const prepared = prepare(raw);
    for (const [id, j] of jobs)
      if (j.status !== "running" && jobs.size >= 100) jobs.delete(id);
    const job = {
      id: randomUUID(),
      controller: new AbortController(),
      status: "running",
      stage: "queued",
      createdAt: new Date().toISOString(),
      metrics: {
        inspectionMs: 0,
        aiMs: 0,
        validationMs: 0,
        totalMs: 0,
        repairCount: 0,
        acceptedWithoutRepair: 0,
        cacheHit: false,
      },
    };
    jobs.set(job.id, job);
    active++;
    job.promise = Promise.resolve().then(() => run(job, prepared));
    return publicJob(job);
  }
  function get(id) {
    const job = jobs.get(id);
    if (!job)
      throw fail(
        "Generation not found; it may have expired or the server restarted.",
        404,
      );
    return publicJob(job);
  }
  async function cancel(id) {
    const job = jobs.get(id);
    if (!job) throw fail("Generation not found.", 404);
    if (job.status === "running") {
      job.controller.abort();
      job.status = "canceled";
      job.stage = "canceled";
      job.error = "Generation canceled.";
    }
    return publicJob(job);
  }
  async function generate(input) {
    const initial = start(input),
      job = jobs.get(initial.generationId);
    await job.promise;
    if (job.status !== "completed")
      throw fail(job.error, job.errorStatus || 499);
    return structuredClone(job.suite);
  }
  async function close() {
    closing = true;
    for (const job of jobs.values())
      if (job.status === "running") job.controller.abort();
    await Promise.allSettled([...jobs.values()].map((j) => j.promise));
    cache.clear();
  }
  return { start, get, cancel, generate, close };
}
module.exports = { createGenerationService, validateInput };
