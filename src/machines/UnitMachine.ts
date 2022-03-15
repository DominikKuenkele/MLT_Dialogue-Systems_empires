import {assign, createMachine, sendParent} from "xstate";
import {empires} from "../Util";
import {units} from "../components/Unit";

interface InitialUnitContext {
    type: units
    health: number,
    attack: number,
    effective: units,
    ineffective: units,
    moveRange: number,
    attackRange: number
}

export interface UnitContext extends InitialUnitContext {
    id: string,
    empire: empires,
}

export const spearmanContext: InitialUnitContext = {
    type: units.Spearman,
    health: 100,
    attack: 30,
    effective: units.Horseman,
    ineffective: units.Archer,
    moveRange: 2,
    attackRange: 1,
}

export const archerContext: InitialUnitContext = {
    type: units.Archer,
    health: 100,
    attack: 30,
    effective: units.Spearman,
    ineffective: units.Horseman,
    moveRange: 2,
    attackRange: 3,
}

export const horsemanContext: InitialUnitContext = {
    type: units.Horseman,
    health: 100,
    attack: 30,
    effective: units.Archer,
    ineffective: units.Spearman,
    moveRange: 3,
    attackRange: 1,
}

export type UnitEvents =
    {
        type: 'DAMAGE',
        damage: number
    }

export const createUnitMachine = (initialContext: UnitContext) => createMachine<UnitContext, UnitEvents>({
        id: 'unit',
        initial: 'idle',
        context: {
            ...initialContext
        },
        states: {
            idle: {
                on: {
                    DAMAGE: 'inAction'
                }
            },
            inAction: {
                entry: assign({
                    health: (context, event) => event.damage < context.health ? context.health -= event.damage : 0
                }),
                always: [
                    {
                        cond: 'isDead',
                        target: 'dead'
                    },
                    {
                        target: 'idle'
                    }
                ]
            },
            dead: {
                entry: sendParent((context) => ({
                        type: 'DEAD',
                        id: context.id
                    })
                ),
                type: 'final'
            }
        }
    },
    {
        guards: {
            isDead: context => context.health <= 0
        }
    });
