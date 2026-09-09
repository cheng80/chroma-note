"""Run: python3 scripts/check-ui-contrast.py — static UI color contract."""
from pathlib import Path
import re

source = (Path(__file__).resolve().parents[1] / 'src/ui/theme.ts').read_text()
colors = dict(re.findall(r"(\w+): '(#[0-9A-Fa-f]{6})'", source))

def luminance(color):
    channels = [int(color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    linear = [x / 12.92 if x <= .04045 else ((x + .055) / 1.055) ** 2.4 for x in channels]
    return sum(a * b for a, b in zip(linear, (.2126, .7152, .0722)))

def ratio(foreground, background):
    low, high = sorted((luminance(colors[foreground]), luminance(colors[background])))
    return (high + .05) / (low + .05)

checks = []
for background in ('bgPage', 'bgSurface', 'bgSunken', 'accentSubtle', 'warningSubtle', 'dangerSubtle', 'successSubtle'):
    for foreground in ('ink', 'inkSecondary', 'inkDisabled'):
        checks.append((foreground, background, 4.5))
    checks.append(('borderControl', background, 3))
for foreground, background in (
    ('inkDisabled', 'bgDisabled'), ('inverse', 'accent'), ('inverse', 'accentPressed'),
    ('inverse', 'danger'), ('accent', 'accentSubtle'), ('warning', 'warningSubtle'),
    ('danger', 'dangerSubtle'), ('success', 'successSubtle'), ('success', 'bgPage'),
    ('danger', 'bgSurface'),
):
    checks.append((foreground, background, 4.5))
checks.extend((foreground, background, 3) for foreground, background in (
    ('borderControl', 'bgDisabled'), ('borderFocus', 'bgSurface'), ('accent', 'bgDisabled'),
))
for foreground, background, minimum in checks:
    measured = ratio(foreground, background)
    assert measured >= minimum, f'{foreground}/{background}: {measured:.2f} < {minimum}'
print(f'PASS: {len(checks)} semantic text, icon and control-boundary pairs')
print(f'Disabled text: {ratio("inkDisabled", "bgDisabled"):.2f}:1')
print(f'Control boundary on disabled surface: {ratio("borderControl", "bgDisabled"):.2f}:1')
print('Static colors only; layout, image backgrounds and runtime gestures require visual checks.')
