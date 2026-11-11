import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { buildModelRegistry } from '../plugin/model-registry.js'

// docs/model-ranking.md ranks every model the plugin advertises. These tests keep it
// in sync with the registry: adding, renaming, or removing a model fails here until
// the ranking is updated too.
const RANKING_PATH = new URL('../../docs/model-ranking.md', import.meta.url)

function rankedModelIDs(markdown: string): string[] {
  const ids: string[] = []
  for (const line of markdown.split(/\r?\n/)) {
    if (!line.startsWith('|')) continue
    const cells = line.split('|').map((cell) => cell.trim())
    // cells[0] is empty (leading pipe); cells[2] is the Model column.
    const modelCell = cells[2] ?? ''
    for (const match of modelCell.matchAll(/`([^`]+)`/g)) ids.push(match[1]!)
  }
  return ids
}

const advertisedBaseIDs = Object.keys(buildModelRegistry())
  .filter((id) => !id.endsWith('-thinking'))
  .sort()

describe('model ranking document', () => {
  const ids = rankedModelIDs(readFileSync(RANKING_PATH, 'utf8'))

  test('lists every advertised model', () => {
    const missing = advertisedBaseIDs.filter((id) => !ids.includes(id))
    expect(missing).toEqual([])
  })

  test('lists no model the plugin does not advertise', () => {
    const stale = ids.filter((id) => !advertisedBaseIDs.includes(id))
    expect(stale).toEqual([])
  })

  test('lists each model once', () => {
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index)
    expect(duplicates).toEqual([])
  })
})
