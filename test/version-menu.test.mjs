// The owner's page: the menu that lists every release and plays the one the visitor picks.
//
// `releases/index.html` is a page with no build step and no library, so the only way to hold it here is to
// read the script out of it and run it against a page made of stubs. Two things are promised:
//
// 1. **The routing.** The overview lists every release newest-first; `?v=<version>` is the page of that one
//    release; a version nobody released, or nothing at all, is the overview.
// 2. **The description.** A release's page renders its `releases/notes/v<version>.md`, which is a `CHANGELOG.md`
//    entry: paragraphs, bullets (one level deep), `code`, **bold** and *italic* - and nothing else may survive
//    into the text a visitor reads.
//
// The stub understands only the handful of DOM calls the page makes. That is the point: a page that starts
// reaching for `querySelector`, `classList` or `innerHTML` fails here, and whoever wrote it decides whether the
// menu really needs another dependency-shaped thing to do its job.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(import.meta.dirname, '..');
const MENU = fs.readFileSync(path.join(ROOT, 'releases', 'index.html'), 'utf8');

/** The page's own script, taken out of the page. */
function menuScript() {
  const match = MENU.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(match, 'the version menu is expected to hold one inline script');
  return match[1];
}

// ---------------------------------------------------------------- the page made of stubs

class StubNode {
  constructor(tagName) {
    this.tagName = tagName === '#text' ? '#text' : tagName.toUpperCase();
    this.className = '';
    this.href = '';
    this.hidden = false;
    this.own = '';
    this.children = [];
  }

  append(...nodes) {
    for (const node of nodes) this.children.push(typeof node === 'string' ? textNode(node) : node);
  }

  appendChildren(...nodes) { this.append(...nodes); }

  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }

  get textContent() {
    return this.own + this.children.map((node) => node.textContent).join('');
  }

  set textContent(value) { this.children = []; this.own = String(value); }

  /** Every element below here (including this one) matching the selector, in the order they were added. */
  every(selector) {
    const found = this.matches(selector) ? [this] : [];
    for (const child of this.children) if (child.tagName !== '#text') found.push(...child.every(selector));
    return found;
  }

  /** The elements this one holds directly, matching the selector - or all of them when none is given. */
  holds(selector) {
    return this.children.filter((node) => selector === undefined || node.matches(selector));
  }

  /** `.a-class` matches a class, `P` matches a tag. That is all the selectors these tests need. */
  matches(selector) {
    return selector.startsWith('.')
      ? this.className.split(' ').includes(selector.slice(1))
      : this.tagName === selector.toUpperCase();
  }
}

function textNode(data) {
  const node = new StubNode('#text');
  node.own = data;
  return node;
}

/**
 * Boot the menu as a visitor would: this is the page at `pathname?search`, and the server answers with the
 * `releases.json` and the notes given. Returns the four elements the page owns, once its loading has finished.
 */
async function openMenu({ releases, notes = {}, pathname = '/releases/', search = '' }) {
  // The page ships both sections hidden, and shows exactly one of them; the stub starts where the markup does.
  const hidden = (node) => { node.hidden = true; return node; };
  const byId = new Map([
    ['overview', hidden(new StubNode('section'))],
    ['releases', new StubNode('div')],
    ['release', hidden(new StubNode('section'))],
    ['development', new StubNode('a')],
  ]);
  const asked = [];
  const page = {
    title: '',
    getElementById: (id) => byId.get(id) || null,
    createElement: (tag) => new StubNode(tag),
  };

  const context = {
    document: page,
    location: { pathname, search },
    URLSearchParams,
    fetch: async (url) => {
      asked.push(url);
      if (url === 'releases.json') {
        return { ok: true, json: async () => releases };
      }
      const name = url.replace(/^notes\//, '');
      return notes[name] === undefined
        ? { ok: false, status: 404 }
        : { ok: true, text: async () => notes[name] };
    },
    console,
  };

  vm.runInNewContext(menuScript(), context);
  // The page loads its list, and then a release's notes, so wait for the promises it made to have landed.
  for (let round = 0; round < 5; round += 1) await new Promise((done) => setImmediate(done));

  return {
    title: page.title,
    overview: byId.get('overview'),
    releases: byId.get('releases'),
    release: byId.get('release'),
    development: byId.get('development'),
    asked,
  };
}

// ---------------------------------------------------------------- a fixture history

const FIXTURE = [
  {
    version: '1.2.0', date: '2026-10-12', released: '2026-10-12T10:00:00.000Z',
    summary: 'The newest thing.', added: 300, removed: 7, logBytes: 3_000_000,
  },
  {
    version: '1.1.0', date: '2026-10-11', released: '2026-10-11T09:00:00.000Z',
    summary: 'The middle thing.', added: 200, removed: 5, logBytes: 2_000_000,
  },
  {
    version: '1.0.0', date: '2026-10-10', summary: 'The first thing.', added: 100, removed: 0,
  },
];

const FIXTURE_NOTES = {
  'v1.1.0.md': [
    'One paragraph with `code`, **bold** and *italic* in it.',
    'Still the same paragraph after a wrap.',
    '',
    '- A bullet, with a `-` in its way.',
    '  a wrapped line of the same bullet.',
    '  - a nested bullet.',
    '- The last bullet.',
  ].join('\n'),
};

// ---------------------------------------------------------------- the overview

test('the overview lists every release, newest first, and offers to play each', async () => {
  const menu = await openMenu({ releases: FIXTURE });

  assert.equal(menu.overview.hidden, false, 'the list is what the visitor came for');
  assert.equal(menu.release.hidden, true, 'no one asked for one release');

  const rows = menu.releases.holds('.version');
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((row) => row.every('.version-name')[0].textContent),
    ['v1.2.0', 'v1.1.0', 'v1.0.0']);

  // Each row is two doors: the text opens the release's page, the button plays it.
  const first = rows[0];
  assert.equal(first.holds('.version-details')[0].href, '?v=1.2.0');
  assert.equal(first.holds('.play')[0].href, 'v1.2.0/');
  assert.equal(first.every('.version-summary')[0].textContent, 'The newest thing.');
});

test('only the newest release is badged, and the facts are the numbers from the manifest', async () => {
  const menu = await openMenu({ releases: FIXTURE });
  const rows = menu.releases.holds('.version');

  assert.equal(rows[0].every('.badge').length, 1);
  assert.equal(rows[0].every('.badge')[0].textContent, 'Newest');
  assert.equal(rows[1].every('.badge').length, 0);

  const facts = rows[0].every('.version-line')[0].holds('span').map((span) => span.textContent);
  assert.ok(facts.some((one) => one === '+300'), 'lines added: ' + facts.join(' | '));
  assert.ok(facts.some((one) => one === '-7'), 'lines removed');
  // The session log grew a megabyte between the two releases, which is about a quarter of a million tokens.
  assert.ok(facts.some((one) => one === '≈250k tok'), 'what the agent wrote: ' + facts.join(' | '));

  // The oldest release has no previous one to measure the log against, so it says nothing about tokens.
  const oldest = rows[2].every('.version-line')[0].holds('span').map((span) => span.textContent);
  assert.equal(oldest.some((one) => one.includes('tok')), false);
  assert.ok(oldest.some((one) => one === '+100'));
});

test('a release page is opened by ?v=, and an unknown version is the overview', async () => {
  const withVersion = await openMenu({ releases: FIXTURE, notes: FIXTURE_NOTES, search: '?v=1.1.0' });
  assert.equal(withVersion.overview.hidden, true);
  assert.equal(withVersion.release.hidden, false);
  assert.equal(withVersion.title, 'Starfall v1.1.0');
  assert.equal(withVersion.release.every('.release-name')[0].textContent, 'v1.1.0');
  assert.equal(withVersion.release.holds('.play')[0].href, 'v1.1.0/');

  for (const search of ['?v=9.9.9', '?v=1.1', '', '?v=']) {
    const back = await openMenu({ releases: FIXTURE, search });
    assert.equal(back.overview.hidden, false, `${search || 'nothing'} is the overview`);
    assert.equal(back.release.hidden, true);
  }
});

test('a release page reaches its neighbours and back to the list', async () => {
  const menu = await openMenu({ releases: FIXTURE, notes: FIXTURE_NOTES, search: '?v=1.1.0', pathname: '/releases/' });
  const links = menu.release.every('a');

  assert.equal(links[0].href, '/releases/', 'back to the list, whatever folder the menu is served from');
  const neighbours = menu.release.every('.neighbours')[0].every('a').map((a) => a.href);
  assert.deepEqual(neighbours, ['?v=1.0.0', '?v=1.2.0'], 'older on the left, newer on the right');
});

test('the first release has no older one, and the newest no newer one', async () => {
  const oldest = await openMenu({ releases: FIXTURE, search: '?v=1.0.0' });
  assert.equal(oldest.release.every('.neighbours')[0].every('a').length, 1);
  assert.equal(oldest.release.every('.neighbours')[0].every('a')[0].href, '?v=1.1.0');

  const newest = await openMenu({ releases: FIXTURE, search: '?v=1.2.0' });
  assert.equal(newest.release.every('.neighbours')[0].every('a').length, 1);
  assert.equal(newest.release.every('.neighbours')[0].every('a')[0].href, '?v=1.1.0');
});

test('an empty list says so instead of showing nothing', async () => {
  const menu = await openMenu({ releases: [] });
  assert.equal(menu.overview.hidden, false);
  assert.equal(menu.releases.textContent.trim(), 'No releases yet.');
});

test('the development build is one folder up in the repository, and beside the menu on the site', async () => {
  assert.equal((await openMenu({ releases: FIXTURE, pathname: '/releases/' })).development.href, '../');
  assert.equal((await openMenu({ releases: FIXTURE, pathname: '/' })).development.href, 'dev/');
  assert.equal((await openMenu({ releases: FIXTURE, pathname: '/index.html' })).development.href, 'dev/');
});

// ---------------------------------------------------------------- the description

test('the notes are rendered: paragraphs, bullets one deep, and inline marks', async () => {
  const menu = await openMenu({ releases: FIXTURE, notes: FIXTURE_NOTES, search: '?v=1.1.0' });
  const notes = menu.release.holds('.notes')[0];

  const paragraphs = notes.holds('p');
  assert.equal(paragraphs.length, 1, 'the two lines of the first paragraph are one paragraph');
  assert.equal(paragraphs[0].textContent,
    'One paragraph with code, bold and italic in it. Still the same paragraph after a wrap.');

  // The marks became elements, not characters.
  const code = paragraphs[0].holds('code');
  assert.deepEqual(code.map((one) => one.textContent), ['code']);
  assert.deepEqual(paragraphs[0].every('strong').map((one) => one.textContent), ['bold']);
  assert.deepEqual(paragraphs[0].every('em').map((one) => one.textContent), ['italic']);
  assert.equal(paragraphs[0].textContent.includes('**'), false);
  assert.equal(paragraphs[0].textContent.includes('`'), false);

  const lists = notes.holds('ul');
  assert.equal(lists.length, 1, 'one list for the top-level bullets');
  const items = lists[0].holds('li');
  assert.equal(items.length, 2, 'two top-level bullets, one of them carrying a nested one');
  assert.ok(items[0].textContent.startsWith('A bullet, with a - in its way. a wrapped line of the same bullet.'),
    items[0].textContent);
  assert.equal(items[1].textContent, 'The last bullet.');

  // The nested bullet lives inside the item it belongs to, in a list of its own.
  const nested = items[0].holds('ul');
  assert.equal(nested.length, 1);
  assert.equal(nested[0].holds('li').length, 1);
  assert.equal(nested[0].holds('li')[0].textContent, 'a nested bullet.');
});

test('a release with no note written says so plainly', async () => {
  const missing = await openMenu({ releases: FIXTURE, search: '?v=1.1.0' });
  assert.equal(missing.release.holds('.notes')[0].textContent.trim(),
    'No description was written for this release.');

  // A note that is there but empty is the same answer, not an empty box on the page.
  const blank = await openMenu({ releases: FIXTURE, notes: { 'v1.1.0.md': '  \n' }, search: '?v=1.1.0' });
  assert.equal(blank.release.holds('.notes')[0].textContent.trim(),
    'No description was written for this release.');
});

// ---------------------------------------------------------------- the real thing

test('the real list renders every release in the tree, newest first', async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'releases', 'releases.json'), 'utf8'));
  const menu = await openMenu({ releases: manifest });
  assert.equal(menu.overview.hidden, false);
  const rows = menu.releases.holds('.version');
  assert.equal(rows.length, manifest.length);
  assert.equal(rows[0].every('.version-name')[0].textContent, `v${manifest[0].version}`);
  assert.equal(rows[rows.length - 1].every('.version-name')[0].textContent,
    `v${manifest[manifest.length - 1].version}`);
});

for (const release of JSON.parse(fs.readFileSync(path.join(ROOT, 'releases', 'releases.json'), 'utf8'))) {
  test(`v${release.version}'s own note renders as prose`, async () => {
    const file = path.join(ROOT, 'releases', 'notes', `v${release.version}.md`);
    const notes = { [`v${release.version}.md`]: fs.readFileSync(file, 'utf8') };
    const menu = await openMenu({ releases: [release], notes, search: `?v=${release.version}` });

    const box = menu.release.holds('.notes')[0];
    const blocks = [...box.holds('p'), ...box.holds('ul')];
    assert.ok(blocks.length >= 2, 'a changelog entry is a paragraph and then its bullets');
    assert.equal(box.textContent.includes('**'), false, 'no bold marker survived');
    assert.equal(box.textContent.includes('`'), false, 'no code marker survived');
    assert.equal(box.every('li').length > 0, true, 'the entry has its bullets');
    assert.ok(box.textContent.includes('- **') === false);
  });
}
