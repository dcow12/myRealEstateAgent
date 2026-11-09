import type { LotFacts, CityStats } from '../engine/rules.ts';

export type TownLot = LotFacts & { pos: [number, number]; cottage: number[] | null; rings: number };

export type TownData = {
  meta: {
    generatedAt: string;
    place: string;
    origin: { lon: number; lat: number; ftPerDegLat: number; ftPerDegLon: number };
    counts: { parcels: number; accounts: number; singleFamily: number; buildings: number; estimatedHouses: number; roads: number };
    stats: CityStats;
    relax: { key: string; label: string; extraHomes: number }[];
    zoneCounts: Record<string, number>;
    scanCounts: Record<string, number>;
    sources: string[];
  };
  boundary: number[];
  parcels: { id: number; use: string; zone: string; poly: number[]; lot: number }[];
  lots: TownLot[];
  buildings: { h: number; p: number; est?: 1; g: number[] }[];
  roads: { k: string; g: number[] }[];
};

export type AgentId = 'surveyor' | 'clerk' | 'builder' | 'steward' | 'planner';

export type AgentAction =
  | { type: 'focus'; lotIndex: number }
  | { type: 'policy'; policy: Partial<import('../engine/rules.ts').Policy> }
  | { type: 'handoff'; to: AgentId; reason: string }
  | { type: 'results'; label: string; place: { name: string; x: number; y: number } | null; homes: { lotIndex: number; address: string; assessedValue: number; driveMinutes: number | null; miles: number | null }[]; total: number; all: number[] };

export type ChatTurn = { role: 'user' | 'assistant'; text: string };

export type AgentRequest = {
  thread: ChatTurn[]; // this agent's conversation only; last turn is the user's
  lotIndex: number | null;
  policy: import('../engine/rules.ts').Policy;
  handoff?: { from: AgentId; summary: string } | null;
};

export type AgentResponse = {
  reply: string;
  actions: AgentAction[];
  tools: { name: string; input: unknown; pre?: boolean }[];
  mode: AgentMode;
  note?: string;
};

export type AgentMode = 'gemini' | 'claude' | 'offline';
