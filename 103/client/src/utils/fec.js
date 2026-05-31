const HEADER_SIZE = 10
const MAX_FEC_GROUP_SIZE = 50

export function createPacketWithFec(sequenceNumber, timestamp, isKeyFrame, payload, fecGroupSize, fecGroupId, fecIndex, isFecPacket) {
  const totalSize = HEADER_SIZE + payload.length
  const packet = new Uint8Array(totalSize)
  const view = new DataView(packet.buffer)

  view.setUint16(0, sequenceNumber & 0xFFFF)
  view.setUint32(2, timestamp >>> 0)

  let flags = 0
  if (isKeyFrame) flags |= 0x80
  if (isFecPacket) flags |= 0x40
  flags |= (fecGroupSize & 0x3F)
  view.setUint8(6, flags)

  view.setUint8(7, fecGroupId & 0xFF)
  view.setUint16(8, fecIndex & 0xFFFF)

  packet.set(payload, HEADER_SIZE)

  return packet
}

export function parsePacketHeader(data) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)

  const sequenceNumber = view.getUint16(0)
  const timestamp = view.getUint32(2) >>> 0
  const flags = view.getUint8(6)

  const isKeyFrame = (flags & 0x80) !== 0
  const isFecPacket = (flags & 0x40) !== 0
  const fecGroupSize = flags & 0x3F

  const fecGroupId = view.getUint8(7)
  const fecIndex = view.getUint16(8)

  const payload = data.subarray(HEADER_SIZE)

  return {
    sequenceNumber,
    timestamp,
    isKeyFrame,
    isFecPacket,
    fecGroupSize,
    fecGroupId,
    fecIndex,
    payload
  }
}

export function xorPackets(packets) {
  if (packets.length === 0) return new Uint8Array(0)

  const maxLen = Math.max(...packets.map((p) => p.length))
  const result = new Uint8Array(maxLen)

  for (const packet of packets) {
    for (let i = 0; i < packet.length; i++) {
      result[i] ^= packet[i]
    }
    for (let i = packet.length; i < maxLen; i++) {
      result[i] ^= 0
    }
  }

  return result
}

export class FecEncoder {
  constructor() {
    this.currentGroup = []
    this.currentGroupId = 0
    this.groupSize = 0
    this.fecEnabled = false
  }

  configure(fecGroupSize) {
    this.groupSize = Math.max(1, Math.min(MAX_FEC_GROUP_SIZE, fecGroupSize))
    this.fecEnabled = this.groupSize > 1
  }

  encode(sequenceNumber, timestamp, isKeyFrame, payload) {
    if (!this.fecEnabled) {
      return {
        primaryPackets: [
          createPacketWithFec(sequenceNumber, timestamp, isKeyFrame, payload, 1, 0, 0, false)
        ],
        redundantPackets: []
      }
    }

    const primary = createPacketWithFec(
      sequenceNumber,
      timestamp,
      isKeyFrame,
      payload,
      this.groupSize,
      this.currentGroupId,
      this.currentGroup.length,
      false
    )

    this.currentGroup.push({ payload, timestamp, isKeyFrame })

    const result = {
      primaryPackets: [primary],
      redundantPackets: []
    }

    if (this.currentGroup.length === this.groupSize) {
      const xorPayload = xorPackets(this.currentGroup.map((p) => p.payload))

      const redundant = createPacketWithFec(
        sequenceNumber + 1,
        timestamp,
        false,
        xorPayload,
        this.groupSize,
        this.currentGroupId,
        this.groupSize,
        true
      )

      result.redundantPackets.push(redundant)

      this.currentGroupId = (this.currentGroupId + 1) & 0xFF
      this.currentGroup = []
    }

    return result
  }

  flush() {
    if (this.currentGroup.length === 0) return []

    const results = []
    for (let i = this.currentGroup.length - 1; i >= 0; i--) {
      const pkt = this.currentGroup[i]
      const primary = createPacketWithFec(
        0,
        pkt.timestamp,
        pkt.isKeyFrame,
        pkt.payload,
        1,
        0,
        0,
        false
      )
      results.push(primary)
    }

    this.currentGroup = []
    return results
  }
}

export class FecDecoder {
  constructor() {
    this.groups = new Map()
  }

  receive(header) {
    if (header.fecGroupSize <= 1 || header.fecGroupSize > MAX_FEC_GROUP_SIZE) {
      return { recovered: null, isFec: header.isFecPacket }
    }

    const groupKey = header.fecGroupId
    let group = this.groups.get(groupKey)

    if (!group) {
      group = {
        groupSize: header.fecGroupSize,
        dataPackets: [],
        fecPacket: null,
        receivedIndices: new Set()
      }
      this.groups.set(groupKey, group)
    }

    if (header.isFecPacket) {
      group.fecPacket = header
    } else {
      group.dataPackets.push(header)
      group.receivedIndices.add(header.fecIndex)
    }

    const missingCount = group.groupSize - group.receivedIndices.size
    const canRecover = missingCount === 1 && group.fecPacket !== null && group.dataPackets.length > 0

    if (canRecover) {
      const missingIndex = this._findMissingIndex(group)
      const recovered = this._recoverPacket(group, missingIndex)

      this.groups.delete(groupKey)

      return { recovered, isFec: false, recoveredIndex: missingIndex }
    }

    if (group.receivedIndices.size === group.groupSize && group.fecPacket !== null) {
      this.groups.delete(groupKey)
    }

    if (group.dataPackets.length > group.groupSize * 2) {
      this.groups.delete(groupKey)
    }

    return { recovered: null, isFec: header.isFecPacket }
  }

  _findMissingIndex(group) {
    for (let i = 0; i < group.groupSize; i++) {
      if (!group.receivedIndices.has(i)) {
        return i
      }
    }
    return -1
  }

  _recoverPacket(group, missingIndex) {
    const xorPayload = group.fecPacket.payload

    const recoveredPayload = new Uint8Array(xorPayload.length)
    for (let i = 0; i < xorPayload.length; i++) {
      recoveredPayload[i] = xorPayload[i]
    }

    for (const pkt of group.dataPackets) {
      if (pkt.fecIndex !== missingIndex) {
        const minLen = Math.min(recoveredPayload.length, pkt.payload.length)
        for (let i = 0; i < minLen; i++) {
          recoveredPayload[i] ^= pkt.payload[i]
        }
      }
    }

    const referencePacket = group.dataPackets[0]

    return {
      timestamp: referencePacket.timestamp,
      isKeyFrame: false,
      payload: recoveredPayload,
      sequenceNumber: referencePacket.sequenceNumber,
      fecIndex: missingIndex,
      isRecovered: true
    }
  }

  cleanup(maxAge = 5000) {
    const now = Date.now()
    for (const [key, group] of this.groups) {
      if (group.lastUpdate && now - group.lastUpdate > maxAge) {
        this.groups.delete(key)
      }
    }
  }
}
