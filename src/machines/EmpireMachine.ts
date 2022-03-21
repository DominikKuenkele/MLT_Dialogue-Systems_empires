import {assign, createMachine, send, sendParent} from "xstate";
import {empires, location, MachineRef} from "../Util";
import {units} from "../components/Unit";
import {pure} from "xstate/es/actions";

export interface initialEmpireContext {
    id: string,
    empire: empires,
    gameBoard: MachineRef,
}

export type MoveUnitType = {
    id: string,
    type: units
}

export interface EmpireContext extends initialEmpireContext {
    moves: {
        production: boolean,
        units: MoveUnitType[]
    }
}

export type EmpireTurnEvent =
    { type: 'RES_TURN', turn: number }

export type EmpireMoveEvent = { type: 'MOVES', moves: { production: boolean, units: MoveUnitType[] } }

export enum moveType {
    attack,
    move
}

export type EmpireUnitMoveEvent =
    { type: 'POSSIBLE_MOVES', moves: { type: moveType, location: location }[] }

export type EmpireEvents =
    | EmpireTurnEvent
    | EmpireMoveEvent
    | EmpireUnitMoveEvent
    | { type: 'TURN' }
    | { type: 'REGISTERED' }
    | { type: 'EXISTS_NOT' }
    | { type: 'OCC_ALLY' }
    | { type: 'OCC_NOT' }
    | { type: 'OCC_ENEMY' }
    | { type: 'OUT_OF_RANGE' }
    | { type: 'EXECUTED' }
    | { type: 'PROD_IN_PROGRESS' }
    | { type: 'YES' }
    | { type: 'NO' }

export const createEmpireMachine = (initialContext: initialEmpireContext) => createMachine<EmpireContext, EmpireEvents>({
    id: 'empire',
    context: {
        ...initialContext,
        moves: {} as {
            production: boolean,
            units: []
        }
    },
    initial: 'settingUp',
    states: {
        settingUp: {
            entry: 'registerAtGameBoard',
            on: {
                REGISTERED: {
                    target: 'waiting',
                    actions: sendParent('EMPIRE_READY')
                }
            },
        },
        turn: {
            initial: 'entry',
            states: {
                entry: {
                    after: {
                        1000: 'fetchMoves'
                    }
                },
                fetchMoves: {
                    entry: send(context => ({
                            type: 'GET_MOVES',
                            empire: context.empire
                        }), {
                            to: context => context.gameBoard.ref
                        }
                    ),
                    on: {
                        MOVES: {
                            target: 'verifyMoves',
                            actions: assign({
                                moves: (_c, event) => event.moves
                            })
                        }
                    }
                },
                verifyMoves: {
                    always: [
                        {
                            cond: 'movesLeft',
                            target: 'produce'
                        },
                        {
                            target: 'final'
                        }
                    ]
                },
                produce: {
                    always: [
                        {
                            cond: context => context.moves.production,
                            actions: 'startProduction',
                            target: 'unit'
                        },
                        {
                            target: 'unit'
                        }
                    ]
                },
                unit: {
                    initial: 'checkIfMovesLeft',
                    states: {
                        checkIfMovesLeft: {
                            always: [
                                {
                                    cond: context => context.moves.units.length > 0,
                                    target: 'executeMove'
                                },
                                {
                                    target: 'final'
                                }
                            ]
                        },
                        executeMove: {
                            entry: send(context => ({
                                type: 'REQ_MOVES_FOR_UNIT',
                                id: context.moves.units[0].id,
                            }), {
                                to: context => context.gameBoard.ref
                            }),
                            on: {
                                POSSIBLE_MOVES: {
                                    target: 'final',
                                    actions: send((context: EmpireContext, event: EmpireUnitMoveEvent) => {
                                            let attackMoves = event.moves.filter((move) => move.type === moveType.attack)
                                            let randomMove;
                                            if (attackMoves.length > 0) {
                                                randomMove = attackMoves[Math.floor(Math.random() * attackMoves.length)]
                                            } else if (event.moves.length > 0) {
                                                randomMove = event.moves[Math.floor(Math.random() * event.moves.length)]
                                            }


                                            let type;
                                            switch (randomMove.type) {
                                                case moveType.attack:
                                                    type = 'ATTACK';
                                                    break;
                                                case moveType.move:
                                                    type = 'MOVE'
                                            }

                                            return {
                                                type: type,
                                                id: context.moves.units[0].id,
                                                x: randomMove.location.x,
                                                y: randomMove.location.y
                                            }
                                        },
                                        {
                                            to: context => context.gameBoard.ref
                                        }),
                                },
                            }
                        },
                        final: {
                            type: 'final'
                        }
                    },
                    onDone: 'fetchMoves'
                },
                final: {
                    type: 'final'
                }
            },
            onDone: {
                target: 'waiting',
                actions: sendParent('EMPIRE_DONE')
            }
        },
        waiting: {
            on: {
                TURN: 'turn'
            }
        },
        defeated: {
            type: 'final'
        },
        victorious: {
            type: 'final'
        }
    }
}, {
    actions: {
        controlUnits: pure((context, event) => {
            let actions = [];
            for (let unitId of context.moves.units) {
                actions.push(send(
                    context => ({
                        type: 'REQ_MOVES_FOR_UNIT',
                        id: unitId,
                    }), {
                        to: context => context.gameBoard.ref
                    }))
            }
            return actions;
        }),
        registerAtGameBoard: send((context) => ({
                type: 'REGISTER',
                empire: context.empire
            }),
            {
                to: context => context.gameBoard.ref
            }
        ),
        startProduction: send(
            () => {
                let producable = [units.Archer, units.Horseman, units.Spearman]
                return {
                    type: 'PRODUCE', unit: producable[Math.floor(Math.random() * producable.length)]
                }
            }, {
                to: context => context.gameBoard.ref
            })

    },
    guards: {
        movesLeft: (context) => context.moves.units.length > 0 || context.moves.production,
    }
});
