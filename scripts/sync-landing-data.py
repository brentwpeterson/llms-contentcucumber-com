#!/usr/bin/env python3
"""
sync-landing-data.py — pull the canonical landing JSON out of the WordPress
theme and into this mirror's vendored copy.

WHY THIS EXISTS (2026-08-23)
----------------------------
llms.contentcucumber.com does not read contentcucumber.com. `src/lib/pages.ts`
eagerly imports `src/data/landing/*.json`, which are hand-copied duplicates of
the theme's `landing-data/*.json`. Nothing kept them in step, so they drifted
until NOT ONE of the 103 files matched its source, 39 pages were missing
entirely, and one file described a page that had been deleted from the site.

That drift is invisible. The mirror builds fine, every page returns 200, and
`audit-live.sh` passes — because that script checks the mirror is HEALTHY, not
that it is CURRENT. A stale mirror is worse than a missing one here: the whole
point is telling AI crawlers what the company says, and it was telling them
things the site had stopped saying.

USAGE
  sync-landing-data.py --check     # report drift, write nothing, exit 1 if drifted
  sync-landing-data.py --apply     # copy source -> mirror
  sync-landing-data.py --apply --prune   # also delete mirror files with no source

  --json                           # machine-readable summary on stdout
  --source PATH                    # override the theme landing-data directory

NOINDEX IS NOT FILTERED HERE, DELIBERATELY. `pages.ts` already skips
`raw.noindex` and `raw.seo.noindex` at build time. Filtering in both places
means two rules to keep in step and a silent divergence the first time one
changes, so the sync copies everything and the renderer stays the only thing
that decides what is public.

PRUNE IS OPT-IN. Deleting a vendored file removes a live URL from the mirror,
so it never happens implicitly. --check always REPORTS orphans; only --prune
acts on them.
"""
import argparse, hashlib, json, os, shutil, sys

DEFAULT_SOURCE = ("/Users/brent/LocalSites/contentcucumber/app/public/"
                  "wp-content/themes/cucumber-gp-child/landing-data")
MIRROR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                      "src", "data", "landing")


def digest(path):
    with open(path, "rb") as fh:
        return hashlib.sha256(fh.read()).hexdigest()


def json_ok(path):
    try:
        with open(path, encoding="utf-8") as fh:
            json.load(fh)
        return True
    except Exception:
        return False


def scan(source):
    src = {f for f in os.listdir(source) if f.endswith(".json")}
    dst = {f for f in os.listdir(MIRROR) if f.endswith(".json")} if os.path.isdir(MIRROR) else set()
    added = sorted(src - dst)
    orphaned = sorted(dst - src)
    updated, unchanged = [], []
    for f in sorted(src & dst):
        if digest(os.path.join(source, f)) != digest(os.path.join(MIRROR, f)):
            updated.append(f)
        else:
            unchanged.append(f)
    return added, updated, unchanged, orphaned


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--prune", action="store_true")
    ap.add_argument("--json", action="store_true", dest="as_json")
    ap.add_argument("--source", default=DEFAULT_SOURCE)
    a = ap.parse_args()
    if not (a.check or a.apply):
        ap.error("pass --check or --apply")

    source = a.source
    if not os.path.isdir(source):
        # LocalWP not mounted, a different machine, a renamed theme. Say so
        # plainly instead of reporting a clean sync against nothing.
        msg = f"source directory not found: {source}"
        print(json.dumps({"ok": False, "error": msg}) if a.as_json else f"ERROR  {msg}",
              file=sys.stderr)
        return 2

    added, updated, unchanged, orphaned = scan(source)
    drift = len(added) + len(updated) + len(orphaned)

    result = {
        "ok": True, "source": source, "mirror": MIRROR,
        "added": added, "updated": updated, "orphaned": orphaned,
        "unchanged": len(unchanged), "drift": drift,
        "mode": "apply" if a.apply else "check",
        "pruned": [], "skipped_invalid": [],
    }

    if a.apply:
        os.makedirs(MIRROR, exist_ok=True)
        for f in added + updated:
            s = os.path.join(source, f)
            # Never copy a file that does not parse. A broken JSON in the
            # mirror fails the Astro build for every page, not just its own.
            if not json_ok(s):
                result["skipped_invalid"].append(f)
                continue
            shutil.copy2(s, os.path.join(MIRROR, f))
        if a.prune:
            for f in orphaned:
                os.remove(os.path.join(MIRROR, f))
                result["pruned"].append(f)

    if a.as_json:
        print(json.dumps(result, indent=1))
    else:
        print(f"  source   {source}")
        print(f"  mirror   {MIRROR}")
        print(f"  unchanged {len(unchanged)}")
        for label, items in (("ADDED", added), ("UPDATED", updated), ("ORPHANED", orphaned)):
            if items:
                print(f"  {label} ({len(items)})")
                for f in items[:20]:
                    print(f"      {f[:-5]}")
                if len(items) > 20:
                    print(f"      ...and {len(items)-20} more")
        if result["skipped_invalid"]:
            print(f"  SKIPPED, INVALID JSON: {result['skipped_invalid']}")
        if result["pruned"]:
            print(f"  PRUNED ({len(result['pruned'])}): {', '.join(x[:-5] for x in result['pruned'])}")
        if a.check:
            print(f"\n  {'DRIFTED — ' + str(drift) + ' file(s) out of step' if drift else 'in sync'}")
        else:
            print(f"\n  synced {len(added)+len(updated)-len(result['skipped_invalid'])} file(s)"
                  + (f", {len(orphaned)} orphan(s) left in place (pass --prune to remove)"
                     if orphaned and not a.prune else ""))

    if result["skipped_invalid"]:
        return 2
    return 1 if (a.check and drift) else 0


if __name__ == "__main__":
    raise SystemExit(main())
