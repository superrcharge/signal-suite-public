# Security

## Reporting a vulnerability

Do not open a public issue for a vulnerability.
Report it privately through the repository's Security tab (Report a vulnerability), or directly to the maintainer listed in `frontend/public/humans.txt`.
Include the affected route or file, how to reproduce it, and which environment you saw it in.

## A security incident in a deployed environment

A suspected compromise of a deployment you run is an incident for whoever operates that deployment, not a bug report.

## Where the security posture is documented

| Topic | Where |
|---|---|
| Authentication, roles and route gates | [`.claude/context/authz.md`](.claude/context/authz.md) |

## Supported versions

Only the latest release is supported.
Fixes ship as a new patch release, and security fixes ship as their own release rather than bundled with feature work.
