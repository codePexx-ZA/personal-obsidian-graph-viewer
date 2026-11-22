const assert = require('node:assert/strict')
const test = require('node:test')
const { buildGraph } = require('../electron/brain.cjs')

const note = (path, content = '# Note') => ({ path, content })

test('suffix resolution prefers the longest match and leaves equal matches unlinked', async () => {
  const result = await buildGraph([
    note('index.md', '[[/home/long/team/plan.md]] [[/else/team/plan.md]]'),
    note('long/team/plan.md'),
    note('short/team/plan.md'),
  ])
  const links = result.links.filter(link => link.kind === 'wiki')
  assert.deepEqual(links.map(link => [link.target, link.provenance]), [['long/team/plan.md', 'path']])
  assert.deepEqual(result.nodes.filter(node => node.domain === 'mentioned'), [])
})

test('suffix resolution preserves manifest provenance and missing-note placeholders', async () => {
  const result = await buildGraph([
    note('index.md', '[[/archive/docs/OLD.md]] [[/archive/docs/missing.md]]'),
    note('docs/renamed.md'),
  ], [{ path: 'docs/_manifest.csv', content: 'Path,OriginalPath,Disposition\nrenamed.md,/original/docs/old.md,kept' }])
  const links = result.links.filter(link => link.kind === 'wiki')
  assert.deepEqual(links.map(link => [link.target, link.provenance]), [
    ['docs/renamed.md', 'manifest'],
    ['mentioned:/archive/docs/missing.md', 'mentioned'],
  ])
})
