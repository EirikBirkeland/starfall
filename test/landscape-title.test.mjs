// A phone on its side is the flying view, and the title has to say so.
//
// At 844x390 the fourteen-row control list, the standing lines and the six-chip rail add up to more
// than the glass: the mark and the launch hint were pushed off both ends and the last rows sat under
// the rail. The phone media rule cannot help (it keys on `max-width: 640px`, and landscape is 844),
// and the shops need a portrait-height plate. So the short-landscape rule keeps the mark, the launch
// hint and TODAY/RULE/MUTE, and leaves the control list and the three shop chips for a turn of the
// phone; the in-run sticks and buttons are paint and work either way.
//
// This is a CSS-shape test: the real-browser audit at 844x390 is what read the boxes and the picture.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const HTML = readFileSync(path.resolve(import.meta.dirname, '..', 'index.html'), 'utf8');

test('a phone on its side gets the flying title, not fourteen clipped rows', () => {
  assert.match(HTML, /@media \(max-height: 520px\) and \(max-width: 1000px\) \{/,
    'the short-landscape rule exists');
  assert.match(HTML,
    /#startScreen \.controls, #startScreen \.standing, #startScreen \.subtitle \{ display: none; \}/,
    'the control list and standing lines are out of the way');
  assert.match(HTML, /#chipSettings, #chipHangar, #chipCodex \{ display: none; \}/,
    'the shops that need a portrait plate are not offered in landscape');
  assert.match(HTML, /#startScreen \{ padding: 12px 24px 80px; \}/,
    'the rail still has its strip at the bottom');
  assert.match(HTML, /id="landscapeNote">HANGAR &#183; CODEX &#183; SETTINGS NEED PORTRAIT</,
    'and the line says where the three shops went');
  assert.match(HTML, /#landscapeNote \{ display: block; \}/, 'the line is shown in landscape');
  assert.match(HTML, /\.landscape-note \{ display: none; \}/, 'and hidden everywhere else');
});
