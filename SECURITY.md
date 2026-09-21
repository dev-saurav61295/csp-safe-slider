# Security Policy

## Supported Versions

`csp-safe-slider` is currently at `1.0.0` — the only version ever
published. Until a `2.x` line exists, the latest `1.x` release receives
security fixes.

| Version | Supported          |
| ------- | ------------------- |
| 1.x     | :white_check_mark:   |
| < 1.0   | :x: (never published) |

This project makes no commitment to backport fixes to older minor/patch
releases once a newer one is available — always update to the latest
`1.x` release to get a security fix.

## Reporting a Vulnerability

**Please do not open a public GitHub issue with exploit details.**

Preferred: use
[GitHub's private vulnerability reporting](https://github.com/dev-saurav61295/csp-safe-slider/security/advisories/new)
for this repository, if it's enabled. This opens a private draft security
advisory that only the maintainer can see until a fix is ready.

If private reporting isn't available, open a
[GitHub Issue](https://github.com/dev-saurav61295/csp-safe-slider/issues)
asking for a private channel to share details, without including exploit
specifics in the issue itself. The maintainer will follow up to arrange a
private exchange.

Please include, where possible:

- The affected version(s).
- A minimal reproduction (fixture HTML/JS, options used).
- The CSP policy in effect, if the report concerns a CSP-bypass claim —
  see [docs/CSP.md](docs/CSP.md) for exactly what this package's CSP
  contract does and does not cover before reporting a CSP-related issue.
- The impact you believe it has.

## Response Expectations

This is an independent, unfunded open-source project maintained by one
person. There is no SLA. As a general goal:

- Acknowledgement of a report: within a few days.
- Initial assessment (valid/not valid, severity): as soon as reasonably
  possible after acknowledgement.
- A fix or mitigation timeline will be communicated once the report is
  assessed — timing depends on severity and complexity, and cannot be
  guaranteed in advance.

Please report in good faith and allow a reasonable amount of time for a
fix before any public disclosure.
