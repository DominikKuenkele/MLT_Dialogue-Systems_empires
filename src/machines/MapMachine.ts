import {assign, createMachine, send, spawn} from "xstate";
import uuid from "uuid-v4";
import {archerContext, createUnitMachine, horsemanContext, spearmanContext, UnitContext} from "./UnitMachine";
import {empires} from "../Util";
import {respond} from "xstate/es/actions";

export interface MapContext {
    map: UnitRef[][];
}

interface UnitRef {
    id: string,
    ref: {}
}

export const dummyUnit: UnitRef = {
    id: '',
    ref: {}
}

export type MapEvents =
    {
        type: 'MOVE',
        id: string,
        x: number,
        y: number
    } |
    {
        type: 'ATTACK',
        id: string,
        x: number,
        y: number
    } |
    {
        type: 'DEAD',
        id: string
    }

export function getUnitLocation(id: string, map: UnitRef[][]): [number, number] {
    for (let rowIndex in map) {
        for (let colIndex in map[rowIndex]) {
            if (map[rowIndex][colIndex] && map[rowIndex][colIndex].id === id) {
                return [parseInt(rowIndex), parseInt(colIndex)];
            }
        }
    }
    // if not found
    return [-1, -1]
}

export function getUnit(id: string, map: UnitRef[][]): UnitRef {
    for (let rowIndex in map) {
        for (let colIndex in map[rowIndex]) {
            if (map[rowIndex][colIndex] && map[rowIndex][colIndex].id === id) {
                return map[rowIndex][colIndex];
            }
        }
    }
    // unit id does not exist
    return dummyUnit;
}

function targetNotOccupied(x: number, y: number, map: UnitRef[][]): boolean {
    const targetUnit = map[y][x];
    return targetUnit.id === '';
}

export const mapMachine = createMachine<MapContext, MapEvents>({
        schema: {
            context: {} as MapContext
        },
        id: 'map',
        initial: 'settingUp',
        states: {
            settingUp: {
                entry: [
                    assign({
                            map: (context) => {
                                const temp = context.map;
                                const newUnit1 = {
                                    ...spearmanContext,
                                    id: uuid(),
                                    empire: empires.empire1
                                }
                                temp[0][5] = {
                                    id: newUnit1.id,
                                    ref: spawn(createUnitMachine(newUnit1))
                                };
                                const newUnit2 = {
                                    ...archerContext,
                                    id: uuid(),
                                    empire: empires.empire2
                                }
                                temp[4][5] = {
                                    id: newUnit2.id,
                                    ref: spawn(createUnitMachine(newUnit2))
                                };
                                const newUnit3 = {
                                    ...spearmanContext,
                                    id: uuid(),
                                    empire: empires.empire2
                                }
                                temp[1][5] = {
                                    id: newUnit3.id,
                                    ref: spawn(createUnitMachine(newUnit3))
                                };
                                return temp;
                            }
                        },
                    )
                ],
                always: 'inGame'
            },
            inGame: {
                type: 'parallel',
                states: {
                    handlingEvents: {
                        on: {
                            MOVE: [
                                {
                                    cond: 'unitExistsNot',
                                    actions: respond({type: 'EXISTS_NOT'})
                                },
                                {
                                    cond: 'outOfRange',
                                    actions: respond({type: 'OUT_OF_RANGE'})
                                },
                                {
                                    cond: 'targetOccupiedByEnemy',
                                    actions: respond({type: 'OCC_ENEMY'})
                                },
                                {
                                    cond: 'targetOccupiedByAlly',
                                    actions: respond({type: 'OCC_ALLY'})
                                },
                                {
                                    actions: 'applyMove'
                                }
                            ],
                            ATTACK: [
                                {
                                    cond: 'unitExistsNot',
                                    actions: respond({type: 'EXISTS_NOT'})
                                },
                                {
                                    cond: 'targetNotOccupied',
                                    actions: respond({type: 'OCC_NOT'})
                                },
                                {
                                    cond: 'targetOccupiedByAlly',
                                    actions: respond({type: 'OCC_ALLY'})
                                },
                                {
                                    cond: 'outOfRange',
                                    actions: respond({type: 'OUT_OF_RANGE'})
                                },
                                {
                                    actions: [
                                        'applyAttackDamage',
                                        'applyReceivedDamage'
                                    ]
                                }
                            ]
                        }
                    },
                    cleanUpMap: {
                        on: {
                            DEAD: {
                                actions: 'removeDeadUnit'
                            }
                        }
                    }
                }
            },
        }
    },
    {
        actions: {
            removeDeadUnit: assign({
                map: (context: MapContext, event: MapEvents) => {
                    const temp = context.map;
                    const [row, col] = getUnitLocation(event.id, context.map);
                    temp[row][col] = dummyUnit;
                    return temp;
                }
            }),
            applyMove: assign({
                map: (context: MapContext, event: MapEvents) => {
                    const temp = context.map;
                    const [row, col] = getUnitLocation(event.id, context.map);
                    temp[event.y][event.x] = temp[row][col];
                    temp[row][col] = dummyUnit;

                    return temp;
                }
            }),
            applyAttackDamage: send(
                (context, event) => {
                    const sourceUnitRef = getUnit(event.id, context.map).ref
                    const sourceUnit: UnitContext = sourceUnitRef.getSnapshot().context
                    const targetUnitRef = context.map[event.y][event.x].ref
                    const targetUnit: UnitContext = targetUnitRef.getSnapshot().context

                    let damage = sourceUnit.attack
                    if (targetUnit.type === sourceUnit.effective) {
                        damage *= 2;
                    } else if (targetUnit.type === sourceUnit.ineffective) {
                        damage /= 2;
                    }
                    return {
                        type: 'DAMAGE',
                        damage: damage
                    }
                },
                {
                    to: (context: MapContext, event: MapEvents) => context.map[event.y][event.x].ref
                }
            ),
            applyReceivedDamage: send(
                (context, event) => {
                    const sourceUnitRef = getUnit(event.id, context.map).ref
                    const sourceUnit: UnitContext = sourceUnitRef.getSnapshot().context
                    const targetUnitRef = context.map[event.y][event.x].ref
                    const targetUnit: UnitContext = targetUnitRef.getSnapshot().context

                    let damage = targetUnit.attack
                    if (sourceUnit.type === targetUnit.effective) {
                        damage *= 2;
                    } else if (sourceUnit.type === targetUnit.ineffective) {
                        damage /= 2;
                    }
                    return {
                        type: 'DAMAGE',
                        damage: damage
                    }
                },
                {
                    to: (context: MapContext, event: MapEvents) => getUnit(event.id, context.map).ref
                }
            )
        },
        guards: {
            unitExistsNot: (context: MapContext, event: MapEvents) => {
                const [x, y] = getUnitLocation(event.id, context.map);
                return (x === -1 || y === -1);
            },
            targetNotOccupied: (context: MapContext, event: MapEvents) => {
                return targetNotOccupied(event.x, event.y, context.map);
            },
            targetOccupiedByEnemy: (context: MapContext, event: MapEvents) => {
                if (targetNotOccupied(event.x, event.y, context.map)) {
                    return false;
                } else {
                    const targetUnitEmpire = context.map[event.y][event.x].ref.getSnapshot().context.empire;
                    const sourceUnitEmpire = getUnit(event.id, context.map).ref.getSnapshot().context.empire;
                    return targetUnitEmpire !== sourceUnitEmpire;
                }
            },
            targetOccupiedByAlly: (context: MapContext, event: MapEvents) => {
                if (targetNotOccupied(event.x, event.y, context.map)) {
                    return false;
                } else {
                    const targetUnitEmpire = context.map[event.y][event.x].ref.getSnapshot().context.empire;
                    const sourceUnitEmpire = getUnit(event.id, context.map).ref.getSnapshot().context.empire;
                    return targetUnitEmpire === sourceUnitEmpire;
                }
            }
        }
    }
);
