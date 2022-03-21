import {ActorRef} from "xstate";

export enum empires {
    empire1 = 'empire1',
    empire2 = 'empire2',
    empire3 = 'empire3',
    empire4 = 'empire4'
}

export type hexCoord = {
    q: number,
    r: number,
    s: number
}

export function isInHexCoordArray(array: hexCoord[], coord: hexCoord) {
    return array.some(neighbour =>
        neighbour.q === coord.q &&
        neighbour.r === coord.r &&
        neighbour.s === coord.s
    )
}


export type location = {
    x: number,
    y: number
}

export interface MachineRef {
    id: string,
    ref: ActorRef<any>
}

export const dummyRef: MachineRef = {
    id: '',
    ref: {} as ActorRef<any>
}
