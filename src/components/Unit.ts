import {empires} from "../Util";

export enum units {
    Archer,
    Horseman,
    Spearman,
    Worker
}

export interface UnitProps {
    empire: empires
}
