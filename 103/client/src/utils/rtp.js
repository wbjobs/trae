const RTP_HEADER_SIZE = 12

export function createRtpPacket(sequenceNumber, chunk) {
  const chunkData = new Uint8Array(chunk.byteLength)
  chunk.copyTo(chunkData)

  const packet = new Uint8Array(RTP_HEADER_SIZE + chunkData.length)
  const view = new DataView(packet.buffer)

  view.setUint8(0, 0x80)
  view.setUint8(1, 96)
  view.setUint16(2, sequenceNumber & 0xFFFF)
  view.setUint32(4, chunk.timestamp & 0xFFFFFFFF)
  view.setUint32(8, 0x00000000)

  const isKeyFrame = chunk.type === 'key'
  view.setUint8(1, isKeyFrame ? 0xE0 : 0x60)

  packet.set(chunkData, RTP_HEADER_SIZE)

  return packet
}

export function parseRtpPacket(data) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)

  const sequenceNumber = view.getUint16(2)
  const timestamp = view.getUint32(4)
  const markerBit = (view.getUint8(1) & 0x80) !== 0

  const chunkData = data.subarray(RTP_HEADER_SIZE)

  return {
    sequenceNumber,
    timestamp,
    isKeyFrame: markerBit,
    chunk: {
      type: markerBit ? 'key' : 'delta',
      timestamp,
      data: chunkData,
      byteLength: chunkData.length
    }
  }
}

export function parsePacketSequence(data) {
  const view = new DataView(data.buffer, data.byteOffset, 4)
  return {
    sequenceNumber: view.getUint16(0),
    timestamp: view.getUint16(2)
  }
}
