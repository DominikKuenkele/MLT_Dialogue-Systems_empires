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
import {dummyRef, empires, location, MachineRef} from "../Util";
import {pure, respond} from "xstate/es/actions";
import {units} from "../components/Unit";
import {GameBoardContext} from "../components/GameBoardContext";

export type GameBoardField = {
    hexCoordinate: {
        q: number,
        r: number;
        s: number
    },
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
    } |
    {
        type: 'PRODUCE',
        unit: units
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
        id: string,
        unitType: units
    } |
    EmpireEvents |
    {
        type: 'START_GAME',
    } |
    {
        type: 'REQ_LIVING_EMPIRES'
    } |
    {
        type: 'START_TURN',
        empire: empires,
        turn: number
    } |
    {
        type: 'END_TURN'
    };

function getBaseLocation(empire: empires, gameBoard: GameBoardField[][]) {
    for (let rowIndex in gameBoard) {
        for (let colIndex in gameBoard[rowIndex]) {
            let unit = gameBoard[rowIndex][colIndex].unit
            if (unit.id !== '' && unit.ref.getSnapshot().context.empire == empire) {
                return [parseInt(rowIndex), parseInt(colIndex)];
            }
        }
    }
    // if not found
    return [-1, -1]
}

function getFreeNeighbour(x: number, y: number, gameBoard: GameBoardField[][]) {
    let hexCoord = gameBoard[y][x].hexCoordinate
    let neighbourCoords: { q: number, r: number }[] = []
    for (let q = -1; q < 2; q++) {
        for (let r = -1; r < 2; r++) {
            if (q !== r) {
                neighbourCoords.push({
                    q: hexCoord.q + q,
                    r: hexCoord.r + r
                })
            }
        }
    }
    console.log(neighbourCoords)

    const isNeighbour = (coord: { q: number, r: number, s: number }) => {
        return neighbourCoords.some(neighbour =>
            neighbour.q === coord.q &&
            neighbour.r === coord.r
        )
    }

    let freeFields = []
    for (let rowIndex in gameBoard) {
        for (let colIndex in gameBoard[rowIndex]) {
            let neighbour = gameBoard[rowIndex][colIndex]
            console.log(neighbour.hexCoordinate)
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
                        actions: assign({
                            currentEmpire: undefined
                        })
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
            checkProducer: assign({
                gameBoard: (context: GameBoardContext) => {
                    let temp = context.gameBoard;
                    for (let prod of context.producer) {
                        if (prod.targetTurn === context.currentTurn) {
                            let [baseY, baseX] = getBaseLocation(prod.unit.ref.getSnapshot().context.empire, context.gameBoard)
                            let [spawnY, spawnX] = getFreeNeighbour(baseX, baseY, context.gameBoard)
                            temp[spawnY][spawnX].unit = prod.unit
                        }
                    }
                    return temp;
                },
                producer: (context: GameBoardContext) => {
                    return context.producer.filter((prod: Producer) => prod.targetTurn !== context.currentTurn)
                }
            }),
            produceUnit: assign({
                producer: (context: GameBoardContext, event: GameBoardEvents) => {
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
                let actions: Actions<any, any> = [];
                for (let rowIndex in context.gameBoard) {
                    for (let colIndex in context.gameBoard[rowIndex]) {
                        let unit = context.gameBoard[rowIndex][colIndex].unit
                        if (unit.id !== '') {
                            let unitSnap = unit.ref.getSnapshot();
                            if (unitSnap.context.empire === context.currentEmpire && unitSnap.context.type !== units.Base) {
                                actions.push(send('MOVABLE', {to: unit.ref}))
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
            spawnEmpire: assign({
                gameBoard: (context: GameBoardContext, event: GameBoardEvents) => {
                    let temp = context.gameBoard;
                    //TODO refactor
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
                            console.log(spawnX,  spawnY)
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
            removeEmpire: assign({
                livingEmpires: (context: GameBoardContext, event: UnitEvents) => {
                    return context.livingEmpires.filter((el: empires) => el !== event.unitEmpire)
                },
                gameBoard: (context: GameBoardContext, event: UnitEvents) => {
                    const temp = context.gameBoard;
                    for (let row = 0; row < context.gameBoard.length; row++) {
                        for (let col = 0; col < context.gameBoard.length; col++) {
                            let fieldUnit = context.gameBoard[row][col].unit
                            if (fieldUnit.id !== '') {
                                if (fieldUnit.ref.getSnapshot().context.empire === event.unitEmpire) {
                                    fieldUnit.ref.stop()
                                    temp[row][col].unit = dummyRef;
                                }
                            }
                        }
                    }
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
            alreadyProducing: (context: GameBoardContext) => {
                return context.producer.some((prod: Producer) => prod.unit.ref.getSnapshot().context.empire === context.currentEmpire)
            },
            unitIsBase: (_: GameBoardContext, event: UnitEvents) => {
                return event.unitType === units.Base
            },
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
