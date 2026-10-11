# Mastra SDK transitive dependency audit — 2026-10-11

**Affected test environment:** Windows; Node v24.19.0; `@mastra/core@1.75.0`, `zod@4.6.6`, `typescript@5.9.3`.

The maintainer independently resolved those versions in a disposable audit directory using a new `package-lock.json`, then ran both `npm audit --omit=dev` and `npm audit`. Both returned **five moderate-severity dependency-tree findings associated with a single advisory**, not five proven vulnerabilities in LoopGrid source code.

- **Advisory:** `GHSA-hp3w-g68c-fv3c` — `sprintf-js` unbounded precision format specifier denial of service.
- **Reported chain:** `@mastra/core -> gray-matter -> js-yaml -> argparse -> sprintf-js`.
- **npm's suggested fix:** `npm audit fix --force` would replace the tested Mastra SDK with `@mastra/core@1.0.4` (breaking downgrade). **Do not apply this fix**.
- **LoopGrid adapter:** No mandatory npm dependencies, does not directly import the affected modules; indirect exposure cannot be ruled out just because the integration itself is not a parser.

**Release decision:** Vulnerability identified and tracked; no forced downgrade. Before publishing a stable npm release, determine whether any input controlled by an untrusted user can reach vulnerable formatting behavior in the host's Mastra workflow, check Mastra's patched dependency availability, and document mitigations or formal risk acceptance. Do not label this advisory remediated until re-audit confirms it.

**Reproduction** (in a disposable directory, *not* the integration source tree):

```powershell
npm init -y
npm install --package-lock-only --ignore-scripts --no-audit '@mastra/core@1.75.0' 'zod@4.6.6'
npm install --package-lock-only --ignore-scripts --no-audit --save-dev 'typescript@5.9.3'
npm audit --omit=dev
npm audit
```

A previous `npm audit` directly in the source failed with `ENOLOCK` because it intentionally had no lockfile; this does not mean the dependency tree was secure or vulnerable by itself.
