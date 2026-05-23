export type Direction8 = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";
export type Diagonal4 = Extract<Direction8, "NE" | "SE" | "SW" | "NW">;
export type Cardinal4 = Extract<Direction8, "N" | "E" | "S" | "W">;
