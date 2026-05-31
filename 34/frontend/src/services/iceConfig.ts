export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface IceConfig {
  iceServers: IceServerConfig[];
  iceTransportPolicy?: RTCIceTransportPolicy;
  bundlePolicy?: RTCBundlePolicy;
  rtcpMuxPolicy?: RTCRtcpMuxPolicy;
}

export interface IceCandidateStats {
  type: 'host' | 'srflx' | 'relay' | 'unknown';
  protocol: 'udp' | 'tcp' | 'unknown';
  priority: number;
  ip: string;
  port: number;
  delayMs?: number;
}

export interface ConnectionStats {
  localCandidates: IceCandidateStats[];
  remoteCandidates: IceCandidateStats[];
  selectedCandidatePair?: {
    local: IceCandidateStats;
    remote: IceCandidateStats;
  };
  connectionTimeMs?: number;
  bytesSent: number;
  bytesReceived: number;
  currentRoundTripTime?: number;
}

export const DEFAULT_STUN_SERVERS: IceServerConfig[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
];

export const DEFAULT_TURN_SERVERS: IceServerConfig[] = [
  {
    urls: [
      'turn:turn1.p2p-cdn.com:3478?transport=udp',
      'turn:turn1.p2p-cdn.com:3478?transport=tcp',
    ],
    username: 'p2p-cdn-user',
    credential: 'p2p-cdn-pass-2024',
  },
  {
    urls: [
      'turn:turn2.p2p-cdn.com:3478?transport=udp',
      'turn:turn2.p2p-cdn.com:3478?transport=tcp',
    ],
    username: 'p2p-cdn-user',
    credential: 'p2p-cdn-pass-2024',
  },
];

export function getCandidateType(candidate: string): 'host' | 'srflx' | 'relay' | 'unknown' {
  if (candidate.includes('typ host')) return 'host';
  if (candidate.includes('typ srflx')) return 'srflx';
  if (candidate.includes('typ relay')) return 'relay';
  return 'unknown';
}

export function getCandidateProtocol(candidate: string): 'udp' | 'tcp' | 'unknown' {
  if (candidate.includes('udp')) return 'udp';
  if (candidate.includes('tcp')) return 'tcp';
  return 'unknown';
}

export function getCandidatePriority(candidate: string): number {
  const match = candidate.match(/priority (\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

export function getCandidateIp(candidate: string): string {
  const parts = candidate.split(' ');
  return parts[4] || '';
}

export function getCandidatePort(candidate: string): number {
  const parts = candidate.split(' ');
  return parseInt(parts[5] || '0', 10);
}

export function parseCandidate(candidate: string): IceCandidateStats {
  return {
    type: getCandidateType(candidate),
    protocol: getCandidateProtocol(candidate),
    priority: getCandidatePriority(candidate),
    ip: getCandidateIp(candidate),
    port: getCandidatePort(candidate),
  };
}

export function calculateCandidateScore(candidate: IceCandidateStats): number {
  let score = 0;

  switch (candidate.type) {
    case 'host':
      score += 1000;
      break;
    case 'srflx':
      score += 500;
      break;
    case 'relay':
      score += 100;
      break;
    default:
      score += 0;
  }

  if (candidate.protocol === 'udp') {
    score += 50;
  } else if (candidate.protocol === 'tcp') {
    score += 20;
  }

  score += Math.min(candidate.priority / 10000, 50);

  if (candidate.delayMs !== undefined) {
    score += Math.max(0, 100 - candidate.delayMs);
  }

  return score;
}

export function sortCandidatesByPriority(candidates: IceCandidateStats[]): IceCandidateStats[] {
  return [...candidates].sort((a, b) => {
    const scoreA = calculateCandidateScore(a);
    const scoreB = calculateCandidateScore(b);
    return scoreB - scoreA;
  });
}

export function shouldUseTurn(pingTimeMs: number, stunSuccessRate: number): boolean {
  return pingTimeMs > 500 || stunSuccessRate < 0.6;
}

export function getOptimizedIceConfig(
  options: {
    enableTurn?: boolean;
    forceRelay?: boolean;
    customStunServers?: IceServerConfig[];
    customTurnServers?: IceServerConfig[];
  } = {}
): RTCConfiguration {
  const {
    enableTurn = true,
    forceRelay = false,
    customStunServers,
    customTurnServers,
  } = options;

  const iceServers: RTCIceServer[] = [];

  const stunServers = customStunServers || DEFAULT_STUN_SERVERS;
  iceServers.push(...stunServers);

  if (enableTurn) {
    const turnServers = customTurnServers || DEFAULT_TURN_SERVERS;
    iceServers.push(...turnServers);
  }

  const config: RTCConfiguration = {
    iceServers,
    iceCandidatePoolSize: 10,
  };

  if (forceRelay) {
    config.iceTransportPolicy = 'relay';
  }

  return config;
}

export function generateTurnConfig(
  serverUrl: string,
  username: string,
  password: string
): IceServerConfig {
  return {
    urls: [
      `${serverUrl}?transport=udp`,
      `${serverUrl}?transport=tcp`,
    ],
    username,
    credential: password,
  };
}

export function formatIceCandidateStats(candidate: IceCandidateStats): string {
  return `[${candidate.type.toUpperCase()}] ${candidate.ip}:${candidate.port} (${candidate.protocol}, priority: ${candidate.priority})`;
}
