#!/usr/bin/env python3
"""Desk-law mint/freeze authority check.

Accepts one JSON object on stdin and writes one JSON object on stdout.
"""

import json
import sys


VALID_STATES = {"active", "renounced", "unknown"}


def authority_check(payload):
    mint = payload.get("mintAuthority")
    freeze = payload.get("freezeAuthority")
    if mint not in VALID_STATES:
        raise ValueError("mintAuthority must be active, renounced, or unknown")
    if freeze not in VALID_STATES:
        raise ValueError("freezeAuthority must be active, renounced, or unknown")

    reasons = []
    if mint == "active":
        reasons.append("mint_authority_exists")
    if freeze == "active":
        reasons.append("freeze_authority_exists")
    kill_signal = bool(reasons)

    if not kill_signal:
        if mint == "unknown":
            reasons.append("mint_authority_unknown")
        if freeze == "unknown":
            reasons.append("freeze_authority_unknown")

    return {
        "schemaVersion": 1,
        "killSignal": kill_signal,
        "scoutSkip": not kill_signal and bool(reasons),
        "mintAuthority": mint,
        "freezeAuthority": freeze,
        "reasons": reasons,
        "runtimeAuthority": False,
    }


def main():
    payload = json.load(sys.stdin)
    json.dump(authority_check(payload), sys.stdout, separators=(",", ":"))
    sys.stdout.write("\n")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, TypeError, json.JSONDecodeError) as error:
        json.dump({"error": str(error), "killSignal": True}, sys.stdout)
        sys.stdout.write("\n")
        raise SystemExit(2)
