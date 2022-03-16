import {ActorRef} from "xstate";

export enum empires {
    empire1 = 'empire1',
    empire2 = 'empire2',
    empire3 = 'empire3',
    empire4 = 'empire4',
    unassigned = ''
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
