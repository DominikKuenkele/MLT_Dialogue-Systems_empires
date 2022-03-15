import {empires} from "../Util";

export enum units {
    Archer,
    Horseman,
    Spearman,
    Worker
}

export interface Unit {
    health: number,
    attack: number,
    effective: units,
    ineffective: units,
    moveRange: number,
    attackRange: number
}

export interface UnitProps {
    empire: empires
}
