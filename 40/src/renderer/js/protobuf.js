export const LocationUpdate = {
  encode(message) {
    const buffer = new ArrayBuffer(8 + 4 + 4 + 4 + 4 + 4 + 8);
    const view = new DataView(buffer);
    let offset = 0;

    const peerIdBytes = new TextEncoder().encode(message.peer_id);
    view.setUint8(offset++, 1);
    view.setUint8(offset++, 2);
    view.setUint32(offset, peerIdBytes.length);
    offset += 4;
    new Uint8Array(buffer, offset, peerIdBytes.length).set(peerIdBytes);
    offset += peerIdBytes.length;

    view.setUint8(offset++, 2);
    view.setUint8(offset++, 18);
    view.setFloat64(offset, message.latitude);
    offset += 8;

    view.setUint8(offset++, 3);
    view.setUint8(offset++, 25);
    view.setFloat64(offset, message.longitude);
    offset += 8;

    view.setUint8(offset++, 4);
    view.setUint8(offset++, 37);
    view.setFloat32(offset, message.accuracy);
    offset += 4;

    view.setUint8(offset++, 5);
    view.setUint8(offset++, 45);
    view.setFloat32(offset, message.speed);
    offset += 4;

    view.setUint8(offset++, 6);
    view.setUint8(offset++, 53);
    view.setFloat32(offset, message.heading);
    offset += 4;

    view.setUint8(offset++, 7);
    view.setUint8(offset++, 56);
    view.setBigInt64(offset, BigInt(message.timestamp));
    offset += 8;

    return buffer.slice(0, offset);
  },

  decode(buffer) {
    const view = new DataView(buffer);
    const message = {};

    let offset = 0;
    while (offset < buffer.byteLength) {
      const fieldAndWire = view.getUint8(offset++);
      const fieldNumber = fieldAndWire >> 3;
      const wireType = fieldAndWire & 0x07;

      switch (wireType) {
        case 2:
          const length = view.getUint32(offset);
          offset += 4;
          const bytes = new Uint8Array(buffer, offset, length);
          offset += length;
          if (fieldNumber === 1) {
            message.peer_id = new TextDecoder().decode(bytes);
          }
          break;
        case 1:
          if (fieldNumber === 2) {
            message.latitude = view.getFloat64(offset);
            offset += 8;
          } else if (fieldNumber === 3) {
            message.longitude = view.getFloat64(offset);
            offset += 8;
          }
          break;
        case 5:
          if (fieldNumber === 4) {
            message.accuracy = view.getFloat32(offset);
            offset += 4;
          } else if (fieldNumber === 5) {
            message.speed = view.getFloat32(offset);
            offset += 4;
          } else if (fieldNumber === 6) {
            message.heading = view.getFloat32(offset);
            offset += 4;
          }
          break;
        case 0:
          if (fieldNumber === 7) {
            message.timestamp = Number(view.getBigInt64(offset));
            offset += 8;
          }
          break;
        default:
          break;
      }
    }

    return message;
  }
};

export function encodeMessage(type, data) {
  switch (type) {
    case 'location':
      return LocationUpdate.encode(data);
    case 'peer-info':
      return encodePeerInfo(data);
    case 'geofence-event':
      return encodeGeofenceEvent(data);
    default:
      throw new Error(`Unknown message type: ${type}`);
  }
}

export function decodeMessage(buffer) {
  if (!buffer || buffer.byteLength === 0) {
    return null;
  }

  try {
    const view = new DataView(buffer);
    const firstByte = view.getUint8(0);
    const fieldNumber = firstByte >> 3;

    switch (fieldNumber) {
      case 1:
        return { type: 'location', data: LocationUpdate.decode(buffer) };
      case 8:
        return { type: 'peer-info', data: decodePeerInfo(buffer) };
      case 9:
        return { type: 'geofence-event', data: decodeGeofenceEvent(buffer) };
      default:
        return null;
    }
  } catch (error) {
    console.error('Failed to decode message:', error);
    return null;
  }
}

function encodePeerInfo(data) {
  const peerIdBytes = new TextEncoder().encode(data.peer_id);
  const nicknameBytes = new TextEncoder().encode(data.nickname);
  const colorBytes = new TextEncoder().encode(data.avatar_color);

  const buffer = new ArrayBuffer(
    2 + 4 + peerIdBytes.length +
    2 + 4 + nicknameBytes.length +
    2 + 4 + colorBytes.length
  );

  const view = new DataView(buffer);
  const uint8 = new Uint8Array(buffer);
  let offset = 0;

  view.setUint8(offset++, 8);
  view.setUint8(offset++, 2);
  view.setUint32(offset, peerIdBytes.length);
  offset += 4;
  uint8.set(peerIdBytes, offset);
  offset += peerIdBytes.length;

  view.setUint8(offset++, 9);
  view.setUint8(offset++, 2);
  view.setUint32(offset, nicknameBytes.length);
  offset += 4;
  uint8.set(nicknameBytes, offset);
  offset += nicknameBytes.length;

  view.setUint8(offset++, 10);
  view.setUint8(offset++, 2);
  view.setUint32(offset, colorBytes.length);
  offset += 4;
  uint8.set(colorBytes, offset);

  return buffer;
}

function decodePeerInfo(buffer) {
  const view = new DataView(buffer);
  const message = {};

  let offset = 0;
  while (offset < buffer.byteLength) {
    const fieldAndWire = view.getUint8(offset++);
    const fieldNumber = fieldAndWire >> 3;
    const wireType = fieldAndWire & 0x07;

    if (wireType === 2) {
      const length = view.getUint32(offset);
      offset += 4;
      const bytes = new Uint8Array(buffer, offset, length);
      offset += length;

      if (fieldNumber === 1) message.peer_id = new TextDecoder().decode(bytes);
      else if (fieldNumber === 2) message.nickname = new TextDecoder().decode(bytes);
      else if (fieldNumber === 3) message.avatar_color = new TextDecoder().decode(bytes);
    }
  }

  return message;
}

function encodeGeofenceEvent(data) {
  const peerIdBytes = new TextEncoder().encode(data.peer_id);
  const geofenceIdBytes = new TextEncoder().encode(data.geofence_id);
  const geofenceNameBytes = new TextEncoder().encode(data.geofence_name);

  const buffer = new ArrayBuffer(
    2 + 4 + peerIdBytes.length +
    2 + 4 + geofenceIdBytes.length +
    2 + 4 + geofenceNameBytes.length +
    2 + 1 +
    2 + 8
  );

  const view = new DataView(buffer);
  const uint8 = new Uint8Array(buffer);
  let offset = 0;

  view.setUint8(offset++, 16);
  view.setUint8(offset++, 2);
  view.setUint32(offset, peerIdBytes.length);
  offset += 4;
  uint8.set(peerIdBytes, offset);
  offset += peerIdBytes.length;

  view.setUint8(offset++, 17);
  view.setUint8(offset++, 2);
  view.setUint32(offset, geofenceIdBytes.length);
  offset += 4;
  uint8.set(geofenceIdBytes, offset);
  offset += geofenceIdBytes.length;

  view.setUint8(offset++, 18);
  view.setUint8(offset++, 2);
  view.setUint32(offset, geofenceNameBytes.length);
  offset += 4;
  uint8.set(geofenceNameBytes, offset);
  offset += geofenceNameBytes.length;

  view.setUint8(offset++, 19);
  view.setUint8(offset++, 8);
  view.setUint8(offset++, data.entered ? 1 : 0);

  view.setUint8(offset++, 20);
  view.setUint8(offset++, 56);
  view.setBigInt64(offset, BigInt(data.timestamp));

  return buffer;
}

function decodeGeofenceEvent(buffer) {
  const view = new DataView(buffer);
  const message = {};

  let offset = 0;
  while (offset < buffer.byteLength) {
    const fieldAndWire = view.getUint8(offset++);
    const fieldNumber = fieldAndWire >> 3;
    const wireType = fieldAndWire & 0x07;

    if (wireType === 2) {
      const length = view.getUint32(offset);
      offset += 4;
      const bytes = new Uint8Array(buffer, offset, length);
      offset += length;

      if (fieldNumber === 1) message.peer_id = new TextDecoder().decode(bytes);
      else if (fieldNumber === 2) message.geofence_id = new TextDecoder().decode(bytes);
      else if (fieldNumber === 3) message.geofence_name = new TextDecoder().decode(bytes);
    } else if (wireType === 0) {
      if (fieldNumber === 4) {
        message.entered = view.getUint8(offset++) === 1;
      } else if (fieldNumber === 5) {
        message.timestamp = Number(view.getBigInt64(offset));
        offset += 8;
      }
    }
  }

  return message;
}

export function encodeJSON(data) {
  return new TextEncoder().encode(JSON.stringify(data));
}

export function decodeJSON(buffer) {
  return JSON.parse(new TextDecoder().decode(buffer));
}
