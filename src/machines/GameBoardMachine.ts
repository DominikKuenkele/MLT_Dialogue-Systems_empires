import {assign, createMachine, send, spawn} from "xstate";
import uuid from "uuid-v4";
import {
    archerContext,
    baseContext,
    createUnitMachine,
    horsemanContext,
    spearmanContext,
    UnitContext
} from "./UnitMachine";
import {dummyRef, empires, location, MachineRef} from "../Util";
import {respond} from "xstate/es/actions";

export type GameBoardField = {
    hexCoordinate: {
        q: number,
        r: number;
        s: number
    },
    unit: MachineRef
}

export interface GameBoardContext {
    gameBoard: GameBoardField[][];
}

type UnitEvents =
    {
        type: 'GET_MOVES',
        empire: empires
    } |
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
    };

type EmpireEvents =
    {
        type: 'REGISTER',
        empire: empires
    }

export type GameBoardEvents =
    UnitEvents |
    {
        type: 'DEAD',
        id: string
    } |
    EmpireEvents |
    {
        type: 'START_GAME',
    }

export function getUnitLocation(id: string, gameBoard: GameBoardField[][]): [number, number] {
    for (let rowIndex in gameBoard) {
        for (let colIndex in gameBoard[rowIndex]) {
            if (gameBoard[rowIndex][colIndex].unit.id === id) {
                return [parseInt(rowIndex), parseInt(colIndex)];
            }
        }
    }
    // if not found
    return [-1, -1]
}

export function getUnit(id: string, gameBoard: GameBoardField[][]): MachineRef {
    for (let rowIndex in gameBoard) {
        for (let colIndex in gameBoard[rowIndex]) {
            if (gameBoard[rowIndex][colIndex].unit.id === id) {
                return gameBoard[rowIndex][colIndex].unit;
            }
        }
    }
    // unit id does not exist
    return dummyRef;
}

function targetNotOccupied(x: number, y: number, gameBoard: GameBoardField[][]): boolean {
    const targetUnit = gameBoard[y][x].unit;
    return targetUnit.id === '';
}

function getDistance(location1: location, location2: location, gameBoard: GameBoardField[][]) {
    const hexCoord1 = gameBoard[location1.y][location1.x].hexCoordinate
    const hexCoord2 = gameBoard[location2.y][location2.x].hexCoordinate

    return (
        Math.abs(hexCoord1.q - hexCoord2.q) +
        Math.abs(hexCoord1.r - hexCoord2.r) +
        Math.abs(hexCoord1.s - hexCoord2.s)
    ) / 2
}

export const createGameBoardMachine = (initialContext: GameBoardContext) => createMachine<GameBoardContext, GameBoardEvents>({
        id: 'gameBoard',
        context: {
            ...initialContext
        },
        initial: 'settingUp',
        states: {
            settingUp: {
                entry: [
                    assign({
                            gameBoard: (context) => {
                                const temp = context.gameBoard;
                                const newUnit1 = {
                                    ...spearmanContext,
                                    id: uuid(),
                                    empire: empires.empire1
                                }
                                temp[0][5].unit = {
                                    id: newUnit1.id,
                                    ref: spawn(createUnitMachine(newUnit1))
                                };
                                const newUnit2 = {
                                    ...archerContext,
                                    id: uuid(),
                                    empire: empires.empire4
                                }
                                temp[4][5].unit = {
                                    id: newUnit2.id,
                                    ref: spawn(createUnitMachine(newUnit2))
                                };
                                const newUnit5 = {
                                    ...horsemanContext,
                                    id: uuid(),
                                    empire: empires.empire4
                                }
                                temp[6][7].unit = {
                                    id: newUnit5.id,
                                    ref: spawn(createUnitMachine(newUnit5))
                                };
                                const newUnit6 = {
                                    ...spearmanContext,
                                    id: uuid(),
                                    empire: empires.empire4
                                }
                                temp[2][6].unit = {
                                    id: newUnit6.id,
                                    ref: spawn(createUnitMachine(newUnit6))
                                };
                                const newUnit3 = {
                                    ...spearmanContext,
                                    id: uuid(),
                                    empire: empires.empire2
                                }
                                temp[1][5].unit = {
                                    id: newUnit3.id,
                                    ref: spawn(createUnitMachine(newUnit3))
                                };
                                const base = {
                                    ...baseContext,
                                    id: uuid(),
                                    empire: empires.empire1
                                }
                                temp[2][5].unit = {
                                    id: newUnit3.id,
                                    ref: spawn(createUnitMachine(base))
                                };
                                return temp;
                            }
                        },
                    ),
                ],
                on: {
                    REGISTER: [
                        {
                            actions: [
                                'spawnEmpire',
                                respond({type: 'REGISTERED'})
                            ]
                        }
                    ],
                    START_GAME: 'inGame'
                }
            },
            inGame: {
                type: 'parallel',
                states: {
                    handlingEvents: {
                        on: {
                            MOVE: [
                                {
                                    cond: 'unitExistsNot',
                                    actions: respond('EXISTS_NOT')
                                },
                                {
                                    cond: 'outOfRange',
                                    actions: respond('OUT_OF_RANGE')
                                },
                                {
                                    cond: 'targetOccupiedByEnemy',
                                    actions: respond('OCC_ENEMY')
                                },
                                {
                                    cond: 'targetOccupiedByAlly',
                                    actions: respond('OCC_ALLY')
                                },
                                {
                                    actions: [
                                        'applyMove',
                                        respond('EXECUTED')
                                    ]
                                }
                            ],
                            ATTACK: [
                                {
                                    cond: 'unitExistsNot',
                                    actions: respond('EXISTS_NOT')
                                },
                                {
                                    cond: 'targetNotOccupied',
                                    actions: respond('OCC_NOT')
                                },
                                {
                                    cond: 'targetOccupiedByAlly',
                                    actions: respond('OCC_ALLY')
                                },
                                {
                                    cond: 'outOfRange',
                                    actions: respond('OUT_OF_RANGE')
                                },
                                {
                                    actions: [
                                        'applyAttackDamage',
                                        'applyReceivedDamage',
                                        respond('EXECUTED')
                                    ]
                                }
                            ],
                            GET_MOVES: {
                                actions: 'getMovableUnits'
                            }
                        }
                    },
                    cleanUpGameBoard: {
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
            getMovableUnits: respond((context: GameBoardContext, event: GameBoardEvents) => {
                let units = [];
                for (let rowIndex in context.gameBoard) {
                    for (let colIndex in context.gameBoard[rowIndex]) {
                        let unit = context.gameBoard[rowIndex][colIndex].unit
                        if (unit.id !== '') {
                            let unitSnap = unit.ref.getSnapshot();
                            if (unitSnap.context.empire === event.empire) {
                                units.push({
                                    id: unit.id,
                                    type: unitSnap.context.type
                                })
                            }
                        }
                    }
                }
                console.log(units)
                return {type: 'UNITS', units: units}
            }),
            spawnEmpire: assign({
                gameBoard: (context: GameBoardContext, event: EmpireEvents) => {
                    let temp = context.gameBoard;
                    //TODO refactor
                    const spawnPoints = [
                        {x: 1, y: 1},
                        {x: 1, y: 8},
                        {x: 13, y: 1},
                        {x: 13, y: 8}
                    ]
                    for (let point of spawnPoints) {
                        if (targetNotOccupied(point.x, point.y, context.gameBoard)) {
                            const base = {
                                ...baseContext,
                                id: uuid(),
                                empire: event.empire
                            }
                            temp[point.y][point.x].unit = {
                                id: base.id,
                                ref: spawn(createUnitMachine(base))
                            };
                            return temp;
                        }
                    }
                    // all spawn points occupied
                    return temp;
                }
            }),
            removeDeadUnit: assign({
                gameBoard: (context: GameBoardContext, event: UnitEvents) => {
                    const temp = context.gameBoard;
                    const [row, col] = getUnitLocation(event.id, context.gameBoard);
                    temp[row][col].unit = dummyRef;
                    return temp;
                }
            }),
            applyMove: assign({
                gameBoard: (context: GameBoardContext, event: UnitEvents) => {
                    const temp = context.gameBoard;
                    const [row, col] = getUnitLocation(event.id, context.gameBoard);
                    temp[event.y][event.x].unit = temp[row][col].unit;
                    temp[row][col].unit = dummyRef;

                    return temp;
                }
            }),
            applyAttackDamage: send(
                (context, event: UnitEvents) => {
                    const sourceUnitRef = getUnit(event.id, context.gameBoard).ref
                    const sourceUnit: UnitContext = sourceUnitRef.getSnapshot().context
                    const targetUnitRef = context.gameBoard[event.y][event.x].unit.ref
                    const targetUnit: UnitContext = targetUnitRef.getSnapshot().context

                    let damage = sourceUnit.attack
                    if (sourceUnit.effective.includes(targetUnit.type)) {
                        damage *= 2;
                    } else if (sourceUnit.ineffective.includes(targetUnit.type)) {
                        damage /= 2;
                    }
                    return {
                        type: 'DAMAGE',
                        damage: damage
                    }
                },
                {
                    to: (context: GameBoardContext, event: UnitEvents) => context.gameBoard[event.y][event.x].unit.ref
                }
            ),
            applyReceivedDamage: send(
                (context, event) => {
                    const [row, col] = getUnitLocation(event.id, context.gameBoard);
                    const sourceUnitRef = getUnit(event.id, context.gameBoard).ref
                    const sourceUnit: UnitContext = sourceUnitRef.getSnapshot().context
                    const targetUnitRef = context.gameBoard[event.y][event.x].unit.ref
                    const targetUnit: UnitContext = targetUnitRef.getSnapshot().context

                    const distance = getDistance(
                        {x: col, y: row},
                        {x: event.x, y: event.y},
                        context.gameBoard
                    );

                    let damage = 0
                    if (distance <= targetUnit.attackRange) {
                        damage = targetUnit.attack
                        if (targetUnit.effective.includes(sourceUnit.type)) {
                            damage *= 2;
                        } else if (targetUnit.ineffective.includes(sourceUnit.type)) {
                            damage /= 2;
                        }
                    }

                    return {
                        type: 'DAMAGE',
                        damage: damage
                    }
                },
                {
                    to: (context: GameBoardContext, event: UnitEvents) => getUnit(event.id, context.gameBoard).ref
                }
            )
        },
        guards: {
            unitExistsNot: (context: GameBoardContext, event: UnitEvents) => {
                const [x, y] = getUnitLocation(event.id, context.gameBoard);
                return (x === -1 || y === -1);
            },
            targetNotOccupied: (context: GameBoardContext, event: UnitEvents) => {
                return targetNotOccupied(event.x, event.y, context.gameBoard);
            },
            targetOccupiedByEnemy: (context: GameBoardContext, event: UnitEvents) => {
                if (targetNotOccupied(event.x, event.y, context.gameBoard)) {
                    return false;
                } else {
                    const targetUnitEmpire = context.gameBoard[event.y][event.x].unit.ref.getSnapshot().context.empire;
                    const sourceUnitEmpire = getUnit(event.id, context.gameBoard).ref.getSnapshot().context.empire;
                    return targetUnitEmpire !== sourceUnitEmpire;
                }
            },
            targetOccupiedByAlly: (context: GameBoardContext, event: UnitEvents) => {
                if (targetNotOccupied(event.x, event.y, context.gameBoard)) {
                    return false;
                } else {
                    const targetUnitEmpire = context.gameBoard[event.y][event.x].unit.ref.getSnapshot().context.empire;
                    const sourceUnitEmpire = getUnit(event.id, context.gameBoard).ref.getSnapshot().context.empire;
                    return targetUnitEmpire === sourceUnitEmpire;
                }
            },
            outOfRange: (context: GameBoardContext, event: UnitEvents) => {
                if (event.x >= context.gameBoard[0].length || event.x < 0 ||
                    event.y >= context.gameBoard.length || event.y < 0) {
                    return true;
                }
                const [row, col] = getUnitLocation(event.id, context.gameBoard);
                const sourceUnit = getUnit(event.id, context.gameBoard).ref.getSnapshot();
                const distance = getDistance(
                    {x: col, y: row},
                    {x: event.x, y: event.y},
                    context.gameBoard
                );

                let unitRange;
                switch (event.type) {
                    case "MOVE":
                        unitRange = sourceUnit.context.moveRange;
                        break;
                    case "ATTACK":
                        unitRange = sourceUnit.context.attackRange;
                        break;
                    default:
                        // should not happen
                        unitRange = 1
                }

                return distance > unitRange
            }
        }
    }
);
