import {empires} from "../Util";

export enum units {
    Archer,
    Horseman,
    Spearman,
    Worker,
    Base
}

export interface UnitProps {
    empire: empires
}
