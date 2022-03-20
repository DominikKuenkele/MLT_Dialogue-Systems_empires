import {empires} from "../Util";

export enum units {
    Archer = "archer",
    Horseman = "horseman",
    Spearman = "spearman",
    Worker = "worker",
    Base = "base"
}


export function getUnitByString(name: string): units | undefined {
    switch(name) {
        case 'archer':
            return units.Archer
        case 'horseman':
            return units.Horseman
        case 'spearman':
            return units.Spearman
        case 'worker':
            return units.Worker
        case 'base':
            return units.Base
        default:
            return undefined
    }
}


export interface UnitProps {
    size: number,
    empire: empires
}
