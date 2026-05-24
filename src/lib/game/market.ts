import { BuildingType, type Resources } from "./types";

export type ResourceKey = keyof Resources;

export const BASIC_RESOURCES: ResourceKey[] = ["wood", "ore"];
export const MAGICAL_RESOURCES: ResourceKey[] = ["mercury", "crystals", "gems", "sulfur"];

export function isBasic(r: ResourceKey) {
  return BASIC_RESOURCES.includes(r);
}

export function isMagical(r: ResourceKey) {
  return MAGICAL_RESOURCES.includes(r);
}

const BASIC_TO_GOLD_RATE = [25, 37, 50, 62, 75, 88, 100, 112, 125];
const MAGICAL_TO_GOLD_RATE = [50, 75, 100, 125, 150, 175, 200, 225, 250];
const GOLD_TO_BASIC_COST = [2500, 1667, 1250, 1000, 833, 714, 625, 556, 500];
const GOLD_TO_MAGICAL_COST = [5000, 3333, 2500, 2000, 1667, 1429, 1250, 1111, 1000];
const BASIC_TO_BASIC_GIVE = [10, 7, 5, 4, 3, 3, 3, 2, 2];
const BASIC_TO_MAGICAL_GIVE = [20, 13, 10, 8, 7, 6, 5, 4, 4];
const MAGICAL_TO_MAGICAL_GIVE = [5, 3, 3, 2, 2, 1, 1, 1, 1];
const MAGICAL_TO_BASIC_GET = [2, 2, 3, 3, 4, 4, 5, 5, 6];

function tableValue(table: number[], marketplaceCount: number): number {
  const idx = Math.max(0, Math.min(table.length - 1, marketplaceCount - 1));
  return table[idx];
}

export function getMarketplaceCount(player: { towns?: Array<{ buildings?: Array<string> }> }): number {
  return (player.towns ?? []).filter((town) => (town.buildings ?? []).includes(BuildingType.MARKET)).length;
}

export interface MarketRateDescriptor {
  give: number;
  receive: number;
  supported: boolean;
}

export function getMarketRate(from: ResourceKey, to: ResourceKey, marketplaceCount: number): MarketRateDescriptor {
  const mp = Math.max(1, marketplaceCount);
  if (from === to) return { give: 0, receive: 0, supported: false };

  if (from === "gold") {
    if (isBasic(to)) return { give: tableValue(GOLD_TO_BASIC_COST, mp), receive: 1, supported: true };
    if (isMagical(to)) return { give: tableValue(GOLD_TO_MAGICAL_COST, mp), receive: 1, supported: true };
    return { give: 0, receive: 0, supported: false };
  }
  if (to === "gold") {
    if (isBasic(from)) return { give: 1, receive: tableValue(BASIC_TO_GOLD_RATE, mp), supported: true };
    if (isMagical(from)) return { give: 1, receive: tableValue(MAGICAL_TO_GOLD_RATE, mp), supported: true };
    return { give: 0, receive: 0, supported: false };
  }
  if (isBasic(from) && isBasic(to)) return { give: tableValue(BASIC_TO_BASIC_GIVE, mp), receive: 1, supported: true };
  if (isBasic(from) && isMagical(to)) return { give: tableValue(BASIC_TO_MAGICAL_GIVE, mp), receive: 1, supported: true };
  if (isMagical(from) && isMagical(to)) return { give: tableValue(MAGICAL_TO_MAGICAL_GIVE, mp), receive: 1, supported: true };
  if (isMagical(from) && isBasic(to)) return { give: 1, receive: tableValue(MAGICAL_TO_BASIC_GET, mp), supported: true };
  return { give: 0, receive: 0, supported: false };
}

export function computeExchangeAmount(
  from: ResourceKey,
  to: ResourceKey,
  fromAmount: number,
  marketplaceCount: number,
): number {
  const rate = getMarketRate(from, to, marketplaceCount);
  if (!rate.supported || rate.give <= 0) return 0;
  const trades = Math.floor(fromAmount / rate.give);
  return trades * rate.receive;
}

export function getRequiredFromAmount(
  from: ResourceKey,
  to: ResourceKey,
  desiredToAmount: number,
  marketplaceCount: number,
): number {
  const rate = getMarketRate(from, to, marketplaceCount);
  if (!rate.supported || rate.receive <= 0) return 0;
  const trades = Math.ceil(desiredToAmount / rate.receive);
  return trades * rate.give;
}
