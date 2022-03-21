import {assign, createMachine, sendParent} from "xstate";
import {empires} from "../Util";
import {units} from "../components/Unit";

export interface InitialUnitContext {
    type: units,
    maxHealth: number,
    health: number,
    attack: number,
    effective: units[],
    ineffective: units[],
    moveRange: number,
    attackRange: number,
    movable: boolean,
    productionTime: number
}

export interface UnitContext extends InitialUnitContext {
    id: string,
    empire: empires
}

export const spearmanContext: InitialUnitContext = {
    type: units.Spearman,
    maxHealth: 100,
    health: 100,
    attack: 30,
    effective: [units.Horseman],
    ineffective: [units.Archer],
    moveRange: 2,
    attackRange: 1,
    productionTime: 2,
    movable: false
}

export const archerContext: InitialUnitContext = {
    type: units.Archer,
    maxHealth: 100,
    health: 100,
    attack: 30,
    effective: [units.Spearman],
    ineffective: [units.Horseman],
    moveRange: 2,
    attackRange: 3,
    productionTime: 3,
    movable: false
}

export const horsemanContext: InitialUnitContext = {
    type: units.Horseman,
    maxHealth: 100,
    health: 100,
    attack: 30,
    effective: [units.Archer],
    ineffective: [units.Spearman],
    moveRange: 3,
    attackRange: 1,
    productionTime: 2,
    movable: false
}

export const baseContext: InitialUnitContext = {
    type: units.Base,
    maxHealth: 250,
    health: 250,
    attack: 40,
    effective: [],
    ineffective: [],
    moveRange: 0,
    attackRange: 1,
    productionTime: 0,
    movable: false
}

type DamageEvent =
    {
        type: 'DAMAGE',
        damage: number
    };

export type UnitEvents =
    DamageEvent |
    {
        type: 'MOVABLE'
    }

export const createUnitMachine = (initialContext: UnitContext) => createMachine<UnitContext, UnitEvents>({
        id: 'unit',
        initial: 'idle',
        context: {
            ...initialContext
        },
        on: {
            MOVABLE: {
                actions: assign({
                    movable: true
                })
            },
            NOT_MOVABLE: {
                actions: assign({
                    movable: false
                })
            },
        },
        states: {
            idle: {
                on: {
                    DAMAGE: 'inAction'
                }
            },
            inAction: {
                entry: assign({
                    health: (context, event: DamageEvent) => event.damage < context.health ? context.health -= event.damage : 0
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
                        id: context.id,
                        unitType: context.type,
                        unitEmpire: context.empire
                    })
                ),
                type: 'final'
            }
        }
    },
    {
        guards: {
            isDead: (context: UnitContext) => context.health <= 0
        }
    });
