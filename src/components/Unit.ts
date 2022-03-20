import {empires} from "../Util";

export enum units {
    Archer = "archer",
    Horseman = "horseman",
    Spearman = "spearman",
    Worker = "worker",
    Base = "base"
}


export function getUnitByString(name: string): units | undefined {
    let index = Object.values(units).indexOf(name)
    return index === -1 ? undefined : Object.keys(units)[index]
}


export interface UnitProps {
    size: number,
    empire: empires
}
