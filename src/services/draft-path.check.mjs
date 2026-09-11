import assert from 'node:assert/strict';

const { workingFileName } = await import('./draft-path.ts');

assert.equal(workingFileName('owner-a', 'file:///old/Documents/chroma-drafts/owner-a/lineart-123.png'), 'lineart-123.png');
assert.equal(workingFileName('owner-a', 'file:///old/Documents/chroma-drafts/owner-b/photo.jpg'), null);
assert.equal(workingFileName('owner-a', 'https://example.com/chroma-drafts/owner-a/photo.jpg'), null);
assert.equal(workingFileName('owner-a', 'file:///old/Documents/chroma-drafts/owner-a/../secret.png'), null);
console.log('draft path check passed');
