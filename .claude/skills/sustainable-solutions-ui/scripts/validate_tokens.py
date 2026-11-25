#!/usr/bin/env python3
"""Validate SSL design tokens against schema and contrast requirements.

Checks:
1. JSON structure matches expected schema
2. Required tokens present in both light and dark modes
3. WCAG 2.2 AA contrast ratios for key text/background pairings
4. Status field indicates verification state
5. Complete type scale (10 steps), spacing, radii, motion, elevation

Run: python scripts/validate_tokens.py
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = json.loads((ROOT / "tokens" / "ssl-candidate.json").read_text())

REQUIRED_TOP_KEYS = ["status", "fonts", "typeScale", "modes", "brand", "spectral", "layout"]

REQUIRED_MODE_TOKENS = [
    "paper", "paper-2", "paper-3", "ink", "ink-2", "ink-3", "ink-4",
    "cardinal", "accent-brand", "rule", "rule-strong",
]

REQUIRED_FONT_KEYS = ["sans", "serif", "mono", "code"]

REQUIRED_TYPE_STEPS = ["xs", "sm", "base", "md", "lg", "xl", "2xl", "3xl", "4xl", "5xl"]

REQUIRED_BRAND = ["navy", "green", "teal", "orange", "cream"]

ACCEPTED_STATUSES = ["SOURCE_VERIFIED", "VERIFIED_PRODUCTION_EXTRACT"]


def lin(ch):
    ch = int(ch, 16) / 255
    return ch / 12.92 if ch <= 0.04045 else ((ch + 0.055) / 1.055) ** 2.4


def luminance(h):
    h = h.lstrip("#")
    # Handle 8-digit hex (with alpha channel) by taking first 6
    if len(h) == 8:
        h = h[:6]
    if len(h) != 6:
        return None
    return sum(k * lin(h[i : i + 2]) for k, i in ((0.2126, 0), (0.7152, 2), (0.0722, 4)))


def ratio(a, b):
    la = luminance(a)
    lb = luminance(b)
    if la is None or lb is None:
        return None
    x, y = sorted((la, lb), reverse=True)
    return (x + 0.05) / (y + 0.05)


failure = False
warnings = []

# 1. Check top-level structure
for key in REQUIRED_TOP_KEYS:
    if key not in DATA:
        print(f"FAIL: Missing required top-level key: {key}")
        failure = True
    else:
        print(f"PASS  top-level key '{key}' present")

# 2. Check status
status = DATA.get("status", "")
if status in ACCEPTED_STATUSES:
    print(f"PASS  status: {status}")
elif status == "PROPOSED_NOT_PRODUCTION_EXTRACT":
    warnings.append("Token status is PROPOSED — not yet verified against production")
    print(f"WARN  status: {status}")
else:
    print(f"WARN  unexpected status: {status}")
    warnings.append(f"Unexpected status value: {status}")

# 3. Check fonts
fonts = DATA.get("fonts", {})
for fk in REQUIRED_FONT_KEYS:
    if fk not in fonts:
        print(f"FAIL: Missing font definition: {fk}")
        failure = True
    elif "value" not in fonts[fk]:
        print(f"FAIL: Font '{fk}' missing 'value' field")
        failure = True
    else:
        print(f"PASS  font {fk}: {fonts[fk]['value'][:50]}...")

# 4. Check type scale (10 steps)
type_scale = DATA.get("typeScale", {})
for step in REQUIRED_TYPE_STEPS:
    if step not in type_scale:
        print(f"FAIL: Missing type scale step: {step}")
        failure = True
    else:
        print(f"PASS  type-scale {step}: {type_scale[step].get('size', '?')}")

# 5. Check mode tokens
modes = DATA.get("modes", {})
for mode_name in ["light", "dark"]:
    mode = modes.get(mode_name, {})
    if not mode:
        print(f"FAIL: Missing mode: {mode_name}")
        failure = True
        continue
    for token in REQUIRED_MODE_TOKENS:
        if token not in mode:
            print(f"FAIL: Missing token '{token}' in {mode_name} mode")
            failure = True

# 6. Check brand colors
brand = DATA.get("brand", {})
for color in REQUIRED_BRAND:
    if color not in brand:
        print(f"FAIL: Missing brand color: {color}")
        failure = True

# 7. Check spectral palette
spectral = DATA.get("spectral", {})
for i in range(1, 12):
    if str(i) not in spectral:
        print(f"FAIL: Missing spectral color: {i}")
        failure = True

# 8. Check spacing, radii, motion, elevation
for section, desc in [
    ("spacing", "Spacing scale"),
    ("radii", "Border radii"),
    ("motion", "Motion/easing tokens"),
    ("elevation", "Elevation/shadow tokens"),
]:
    if section not in DATA:
        print(f"FAIL: Missing section: {section}")
        failure = True
    else:
        print(f"PASS  {desc} present")

# 9. Check line heights and letter spacing
for section, desc in [
    ("lineHeights", "Line heights"),
    ("letterSpacing", "Letter spacing"),
]:
    if section not in DATA:
        warnings.append(f"Missing optional section: {section}")
        print(f"WARN  {desc} missing")
    else:
        print(f"PASS  {desc} present")

# 10. Contrast checks
print("\nContrast checks (WCAG 2.2 AA):")
contrast_pairs = [
    # Light mode
    ("light", "ink", "paper", 4.5, "ink on paper"),
    ("light", "ink-2", "paper", 4.5, "ink-2 on paper"),
    ("light", "ink-3", "paper", 3.0, "ink-3 on paper (large text)"),
    ("light", "cardinal", "paper", 3.0, "cardinal on paper"),
    # Dark mode
    ("dark", "ink", "paper", 4.5, "ink on paper (dark)"),
    ("dark", "ink-2", "paper", 4.5, "ink-2 on paper (dark)"),
    ("dark", "ink-3", "paper", 3.0, "ink-3 on paper (dark)"),
    ("dark", "cardinal", "paper", 3.0, "cardinal on paper (dark)"),
]

for mode_name, fg_token, bg_token, minimum, label in contrast_pairs:
    mode = modes.get(mode_name, {})
    fg_val = mode.get(fg_token, "")
    bg_val = mode.get(bg_token, "")

    # Skip non-hex values (e.g. var() references)
    if not fg_val.startswith("#") or not bg_val.startswith("#"):
        warnings.append(f"Cannot compute contrast for {mode_name} {label}: non-hex value")
        print(f"SKIP  {mode_name:<5} {label:<30} (non-hex value)")
        continue

    value = ratio(fg_val, bg_val)
    if value is None:
        warnings.append(f"Cannot parse colors for {mode_name} {label}")
        print(f"SKIP  {mode_name:<5} {label:<30} (parse error)")
        continue

    passed = value >= minimum
    print(f"{'PASS' if passed else 'FAIL'} {mode_name:<5} {label:<30} {value:.2f}:1 (min {minimum})")
    failure |= not passed

# 11. Layout checks
layout = DATA.get("layout", {})
if "contentMax" not in layout and "containerContentMax" not in layout:
    print("FAIL: Missing layout.contentMax")
    failure = True

# 12. Check chart/map stack documentation
if "chartMapStack" in DATA:
    print("PASS  Chart/map stack documented")
else:
    warnings.append("Chart/map stack not documented")

# Summary
print(f"\nSummary: {'FAIL' if failure else 'PASS'} ({len(warnings)} warnings)")
for w in warnings:
    print(f"  WARN: {w}")

raise SystemExit(1 if failure else 0)
