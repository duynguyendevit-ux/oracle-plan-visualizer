export interface HashRingPoint {
  hash: number
  serverId: string
  vnodeIndex: number
}

export interface KeyAssignment {
  key: string
  hash: number
  serverId: string
}

export interface HashRingAnalysis {
  ring: HashRingPoint[]
  assignments: KeyAssignment[]
  distribution: Record<string, number>
}

export interface AssignmentChange {
  key: string
  from: string
  to: string
}

export interface MovementAnalysis {
  compared: number
  moved: number
  percentage: number
  changes: AssignmentChange[]
}

async function hashValue(value: string): Promise<number> {
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto is not available in this browser.')
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return new DataView(digest).getUint32(0, false)
}

export function assignHash(ring: HashRingPoint[], hash: number): HashRingPoint | null {
  if (ring.length === 0) return null

  let low = 0
  let high = ring.length
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (ring[middle].hash < hash) low = middle + 1
    else high = middle
  }

  return ring[low === ring.length ? 0 : low]
}

export async function locateKey(ring: HashRingPoint[], key: string): Promise<KeyAssignment | null> {
  const hash = await hashValue(key)
  const owner = assignHash(ring, hash)
  return owner ? { key, hash, serverId: owner.serverId } : null
}

export async function analyzeHashRing(
  servers: string[],
  virtualNodes: number,
  keys: string[],
): Promise<HashRingAnalysis> {
  const ring = await Promise.all(servers.flatMap((serverId) => (
    Array.from({ length: virtualNodes }, async (_, vnodeIndex) => ({
      hash: await hashValue(`${serverId}#${vnodeIndex}`),
      serverId,
      vnodeIndex,
    }))
  )))
  ring.sort((left, right) => left.hash - right.hash || left.serverId.localeCompare(right.serverId) || left.vnodeIndex - right.vnodeIndex)

  const assignments = (await Promise.all(keys.map((key) => locateKey(ring, key))))
    .filter((assignment): assignment is KeyAssignment => assignment !== null)
  const distribution = Object.fromEntries(servers.map((serverId) => [serverId, 0]))
  for (const assignment of assignments) distribution[assignment.serverId] += 1

  return { ring, assignments, distribution }
}

export function compareAssignments(
  previous: KeyAssignment[] | null,
  current: KeyAssignment[],
): MovementAnalysis | null {
  if (!previous) return null
  const previousByKey = new Map(previous.map((assignment) => [assignment.key, assignment.serverId]))
  const changes = current.flatMap((assignment) => {
    const previousServer = previousByKey.get(assignment.key)
    return previousServer && previousServer !== assignment.serverId
      ? [{ key: assignment.key, from: previousServer, to: assignment.serverId }]
      : []
  })
  const compared = current.filter((assignment) => previousByKey.has(assignment.key)).length

  return {
    compared,
    moved: changes.length,
    percentage: compared === 0 ? 0 : (changes.length / compared) * 100,
    changes,
  }
}
