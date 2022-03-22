import {Actions, assign, createMachine, send, spawn} from "xstate";
import uuid from "uuid-v4";
import {
    archerContext,
    baseContext,
    createUnitMachine,
    horsemanContext,
    InitialUnitContext,
    spearmanContext,
    UnitContext
} from "./UnitMachine";
import {dummyRef, empires, hexCoord, isInHexCoordArray, location, MachineRef} from "../Util";
import {pure, respond} from "xstate/es/actions";
import {units} from "../components/Unit";
import {GameBoardContext} from "../components/GameBoardContext";
import {moveType} from "./EmpireMachine";

export type GameBoardField = {
    hexCoordinate: hexCoord,
    unit: MachineRef
}

export type Producer = {
    unit: MachineRef,
    targetTurn: number
}

export interface GameBoardContext {
    gameBoard: GameBoardField[][];
    livingEmpires: empires[];
    currentEmpire: empires | undefined;
    currentTurn: number
    producer: Producer[]

}


type UnitEvents =
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

type UnitMoveEvents =
    {
        type: 'REQ_MOVES_FOR_UNIT',
        id: string,
    };

type ProduceEvent =
    {
        type: 'PRODUCE',
        unit: units
    };

type DeadEvent =
    {
        type: 'DEAD',
        id: string,
        unitType: units,
        unitEmpire: empires
    };

type EmpireEvents =
    {
        type: 'REGISTER',
        empire: empires
    } |
    {
        type: 'GET_MOVES',
        empire: empires
    };

type StartTurnEvent =
    {
        type: 'START_TURN',
        empire: empires,
        turn: number
    };

export type GameBoardEvents =
    UnitEvents |
    UnitMoveEvents |
    EmpireEvents |
    ProduceEvent |
    DeadEvent |
    StartTurnEvent |
    {
        type: 'START_GAME',
    } |
    {
        type: 'REQ_LIVING_EMPIRES'
    } |
    {
        type: 'END_TURN'
    } |
    {
        type: 'REQ_TURN'
    };

function getBaseLocation(empire: empires, gameBoard: GameBoardField[][]) {
    for (let rowIndex in gameBoard) {
        for (let colIndex in gameBoard[rowIndex]) {
            let unit = gameBoard[rowIndex][colIndex].unit
            if (unit.id === '') {
                continue;
            }

            let unitContext = unit.ref.getSnapshot().context;
            if (unitContext.empire == empire && unitContext.type === units.Base) {
                return [parseInt(rowIndex), parseInt(colIndex)];
            }
        }
    }
    // if not found
    return [-1, -1]
}

function getAllNeighbours(x: number, y: number, max_dist: number, gameBoard: GameBoardField[][]) {
    let hexCoord = gameBoard[y][x].hexCoordinate
    let neighbourCoords: hexCoord[] = []
    for (let q = -max_dist; q < max_dist + 1; q++) {
        for (let r = Math.max(-max_dist, -q - max_dist); r < Math.min(max_dist, -q + max_dist) + 1; r++) {
            let s = -q - r
            if (q === 0 && r === 0 && s === 0)
                continue;

            neighbourCoords.push({
                q: hexCoord.q + q,
                r: hexCoord.r + r,
                s: hexCoord.s + s
            })
        }
    }

    return neighbourCoords;
}

function getFreeNeighbour(x: number, y: number, gameBoard: GameBoardField[][]) {
    let neighbourCoords = getAllNeighbours(x, y, 1, gameBoard)

    const isNeighbour = (coord: hexCoord) => {
        return isInHexCoordArray(neighbourCoords, coord)
    }

    let freeFields = []
    for (let rowIndex in gameBoard) {
        for (let colIndex in gameBoard[rowIndex]) {
            let neighbour = gameBoard[rowIndex][colIndex]
            if (isNeighbour(neighbour.hexCoordinate) && neighbour.unit.id === '') {
                freeFields.push([parseInt(rowIndex), parseInt(colIndex)])
            }
        }
    }

    if (freeFields.length > 0) {
        return freeFields[Math.floor(Math.random() * freeFields.length)]
    } else {
        return [-1, -1]
    }
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

export const createGameBoardMachine = (gameBoard: GameBoardField[][]) => createMachine<GameBoardContext, GameBoardEvents>({
        id: 'gameBoard',
        context: {
            gameBoard: gameBoard,
            currentEmpire: undefined,
            livingEmpires: [],
            currentTurn: 0,
            producer: [] as Producer[]
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


                                const newUnit7 = {
                                    ...horsemanContext,
                                    id: uuid(),
                                    empire: empires.empire1
                                }
                                temp[3][11].unit = {
                                    id: newUnit7.id,
                                    ref: spawn(createUnitMachine(newUnit7))
                                };

                                const newUnit8 = {
                                    ...horsemanContext,
                                    id: uuid(),
                                    empire: empires.empire3
                                }
                                temp[6][8].unit = {
                                    id: newUnit8.id,
                                    ref: spawn(createUnitMachine(newUnit8))
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
                    START_GAME: 'waitingForTurn'
                }

            },
            waitingForTurn: {
                on: {
                    START_TURN: {
                        target: 'turn',
                        actions: assign({
                            currentEmpire: (_, event) => event.empire,
                            currentTurn: (_, event) => event.turn
                        })
                    },
                    REQ_LIVING_EMPIRES: {
                        actions: respond((context: GameBoardContext) => ({
                            type: 'SEND_LIVING_EMPIRES',
                            empires: context.livingEmpires
                        }))
                    }
                }
            },
            turn: {
                type: 'parallel',
                entry: [
                    'checkProducer',
                    'makeUnitsMovable'
                ],
                on: {
                    END_TURN: {
                        target: 'waitingForTurn',
                        actions: [
                            assign({
                                currentEmpire: undefined
                            })
                        ]
                    }
                },
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
                                        send('NOT_MOVABLE', {
                                            to: (context: GameBoardContext, event: UnitEvents) => {
                                                let unit = getUnit(event.id, context.gameBoard)
                                                return unit.ref
                                            }
                                        }),
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
                                    cond: 'targetNotOnMap',
                                    actions: respond('OUT_OF_RANGE')
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
                                        send('NOT_MOVABLE', {
                                            to: (context: GameBoardContext, event: UnitEvents) => {
                                                let unit = getUnit(event.id, context.gameBoard)
                                                return unit.ref
                                            }
                                        }),
                                        'applyAttackDamage',
                                        'applyReceivedDamage',
                                        respond('EXECUTED')
                                    ]
                                }
                            ],
                            PRODUCE: [
                                {
                                    cond: 'alreadyProducing',
                                    actions: respond('PROD_IN_PROGRESS')
                                },
                                {
                                    actions: [
                                        'produceUnit',
                                        respond('EXECUTED')
                                    ]
                                }
                            ],
                            GET_MOVES: {
                                actions: 'getMoves'
                            },
                            REQ_TURN: {
                                actions: respond(context => ({
                                        type: 'RES_TURN',
                                        turn: context.currentTurn
                                    })
                                )
                            },
                            REQ_MOVES_FOR_UNIT: {
                                actions: respond((context, event: UnitMoveEvents) => {
                                    let unit = getUnit(event.id, context.gameBoard).ref.getSnapshot().context
                                    let [unitY, unitX] = getUnitLocation(event.id, context.gameBoard)

                                    let attackableFields = getAllNeighbours(unitX, unitY, unit.attackRange, context.gameBoard)
                                    let movableFields = getAllNeighbours(unitX, unitY, unit.moveRange, context.gameBoard)

                                    let moves = [] as { type: moveType, location: location }[]
                                    for (let rowIndex in context.gameBoard) {
                                        for (let colIndex in context.gameBoard[rowIndex]) {
                                            if (isInHexCoordArray(attackableFields, gameBoard[rowIndex][colIndex].hexCoordinate)) {
                                                let unit = gameBoard[rowIndex][colIndex].unit;
                                                if (unit.id !== '' && unit.ref.getSnapshot().context.empire !== context.currentEmpire) {
                                                    moves.push({
                                                        type: moveType.attack,
                                                        location: {x: parseInt(colIndex), y: parseInt(rowIndex)}
                                                    })
                                                }
                                            }
                                            if (isInHexCoordArray(movableFields, gameBoard[rowIndex][colIndex].hexCoordinate)) {
                                                if (gameBoard[rowIndex][colIndex].unit.id === '') {
                                                    moves.push({
                                                        type: moveType.move,
                                                        location: {x: parseInt(colIndex), y: parseInt(rowIndex)}
                                                    })
                                                }
                                            }
                                        }
                                    }

                                    return {
                                        type: 'POSSIBLE_MOVES',
                                        moves: moves
                                    }
                                })
                            }
                        }
                    },
                    cleanUpGameBoard: {
                        on: {
                            DEAD: [
                                {
                                    cond: 'unitIsBase',
                                    actions: 'removeEmpire'
                                },
                                {
                                    actions: 'removeDeadUnit'
                                }
                            ]
                        }
                    }
                }
            },
        }
    },
    {
        actions: {
            checkProducer: assign<GameBoardContext>({
                gameBoard: (context) => {
                    let temp = context.gameBoard;
                    for (let prod of context.producer) {
                        if (prod.targetTurn === context.currentTurn) {
                            let [baseY, baseX] = getBaseLocation(prod.unit.ref.getSnapshot().context.empire, context.gameBoard)

                            if (baseX < 0 || baseY < 0) {
                                // producing a unit for a defeated empire
                                // TODO Validate before
                                continue;
                            }

                            let [spawnY, spawnX] = getFreeNeighbour(baseX, baseY, context.gameBoard)
                            temp[spawnY][spawnX].unit = prod.unit
                        }
                    }
                    return temp;
                },
                producer: (context: GameBoardContext) => {
                    return context.producer.filter((prod: Producer) => prod.targetTurn > context.currentTurn)
                }
            }),
            produceUnit: assign<GameBoardContext, ProduceEvent>({
                producer: (context, event) => {
                    let productionTime = 0;
                    let initialContext: InitialUnitContext;
                    switch (event.unit) {
                        case units.Archer:
                            initialContext = archerContext
                            productionTime = archerContext.productionTime
                            break;
                        case  units.Spearman:
                            initialContext = spearmanContext
                            productionTime = spearmanContext.productionTime
                            break;
                        case units.Horseman:
                            initialContext = horsemanContext
                            productionTime = horsemanContext.productionTime
                            break;
                        case units.Base:
                            initialContext = baseContext
                            productionTime = baseContext.productionTime
                            break;
                        default:
                        //cannot happen, since event.unit is of type units
                    }

                    const newUnit = {
                        ...initialContext!,
                        id: uuid(),
                        empire: context.currentEmpire!
                    }

                    return [
                        ...context.producer,
                        {
                            unit: {
                                id: newUnit.id,
                                ref: spawn(createUnitMachine(newUnit))
                            },
                            targetTurn: context.currentTurn + productionTime
                        }
                    ]
                }
            }),
            makeUnitsMovable: pure((context: GameBoardContext) => {
                let actions: Actions<GameBoardContext, GameBoardEvents> = [];
                for (let rowIndex in context.gameBoard) {
                    for (let colIndex in context.gameBoard[rowIndex]) {
                        let unit = context.gameBoard[rowIndex][colIndex].unit
                        if (unit.id !== '') {
                            let unitSnap = unit.ref.getSnapshot();
                            if (unitSnap.context.empire === context.currentEmpire && unitSnap.context.type !== units.Base) {
                                actions.push(send('MOVABLE', {to: unit.ref}))
                            } else {
                                actions.push(send('NOT_MOVABLE', {to: unit.ref}))
                            }
                        }
                    }
                }
                return actions;
            }),
            getMoves: respond((context: GameBoardContext) => {
                let units = [];
                for (let rowIndex in context.gameBoard) {
                    for (let colIndex in context.gameBoard[rowIndex]) {
                        let unit = context.gameBoard[rowIndex][colIndex].unit
                        if (unit.id !== '') {
                            let unitSnap = unit.ref.getSnapshot();
                            if (unitSnap.context.movable) {
                                units.push({
                                    id: unit.id,
                                    type: unitSnap.context.type
                                })
                            }
                        }
                    }
                }
                return {
                    type: 'MOVES',
                    moves: {
                        production: context.producer.every((prod) => prod.unit.ref.getSnapshot().context.empire !== context.currentEmpire),
                        units: units
                    }
                }
            }),
            spawnEmpire: assign<GameBoardContext, EmpireEvents>({
                gameBoard: (context, event) => {
                    let temp = context.gameBoard;
                    const spawnPoints = [
                        {x: 1, y: 1},
                        {x: 1, y: context.gameBoard.length - 2},
                        {x: context.gameBoard[0].length - 2, y: 1},
                        {x: context.gameBoard[0].length - 2, y: context.gameBoard.length - 2}
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

                            const initialUnit = {
                                ...archerContext,
                                id: uuid(),
                                empire: event.empire
                            }
                            let [spawnY, spawnX] = getFreeNeighbour(point.x, point.y, context.gameBoard)
                            temp[spawnY][spawnX].unit = {
                                id: initialUnit.id,
                                ref: spawn(createUnitMachine(initialUnit))
                            };
                            return temp;
                        }
                    }
                    // all spawn points occupied
                    return temp;
                },
                livingEmpires: (context, event) => ([
                    ...context.livingEmpires,
                    event.empire
                ])

            }),
            removeEmpire: assign<GameBoardContext, DeadEvent>({
                livingEmpires: (context, event) => {
                    return context.livingEmpires.filter((el: empires) => el !== event.unitEmpire)
                },
                gameBoard: (context, event) => {
                    const temp = context.gameBoard;
                    for (let rowIndex in gameBoard) {
                        for (let colIndex in gameBoard[rowIndex]) {
                            let fieldUnit = context.gameBoard[rowIndex][colIndex].unit
                            if (fieldUnit.id !== '') {
                                if (fieldUnit.ref.getSnapshot().context.empire === event.unitEmpire) {
                                    fieldUnit.ref.stop()
                                    temp[rowIndex][colIndex].unit = dummyRef;
                                }
                            }
                        }
                    }
                    return temp;
                },
                producer: (context, event) => {
                    return context.producer.filter(
                        (prod: Producer) => prod.unit.ref.getSnapshot().context.empire !== event.unitEmpire
                    )
                }
            }),
            removeDeadUnit: assign<GameBoardContext, DeadEvent>({
                gameBoard: (context, event) => {
                    const temp = context.gameBoard;

                    const [row, col] = getUnitLocation(event.id, context.gameBoard);
                    temp[row][col].unit = dummyRef;

                    return temp;
                }
            }),
            applyMove: assign<GameBoardContext, UnitEvents>({
                gameBoard: (context, event) => {
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
            alreadyProducing: (context: GameBoardContext) => {
                return context.producer.some((prod: Producer) => prod.unit.ref.getSnapshot().context.empire === context.currentEmpire)
            },
            unitIsBase: (_: GameBoardContext, event: DeadEvent) => {
                return event.unitType === units.Base
            },
            unitExistsNot: (context: GameBoardContext, event: UnitEvents) => {
                const [x, y] = getUnitLocation(event.id, context.gameBoard);
                return (x === -1 || y === -1);
            },
            targetNotOnMap: (context: GameBoardContext, event: UnitEvents) => {
                if (event.x >= context.gameBoard[0].length || event.x < 0 ||
                    event.y >= context.gameBoard.length || event.y < 0) {
                    return true;
                }
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
