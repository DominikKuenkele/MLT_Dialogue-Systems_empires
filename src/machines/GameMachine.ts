import {assign, createMachine, send, spawn} from "xstate";
import uuid from "uuid-v4";
import {dummyRef, empires, MachineRef} from "../Util";
import {createEmpireMachine} from "./EmpireMachine";

interface GameContext {
    userEmpire: MachineRef,
    currentEmpire: MachineRef,
    aiEmpireQueue: MachineRef[],
    aiEmpirePile: MachineRef[],
    gameBoard: MachineRef,

    machinesReady: number,
    running: boolean
}

type GameEvents =
    {
        type: 'START'
    } |
    {
        type: 'EMPIRE_DONE',
    } |
    {
        type: 'EMPIRE_READY'
    };

export const gameMachine = createMachine<GameContext, GameEvents>({
        id: 'game',
        context: {
            userEmpire: dummyRef,
            aiEmpireQueue: [],
            aiEmpirePile: [],
            currentEmpire: dummyRef,
            gameBoard: dummyRef,
            machinesReady: 0,
            running: false
        },
        initial: 'idle',
        states: {
            idle: {
                on: {
                    START: 'settingUp'
                }
            },
            settingUp: {
                type: 'parallel',
                states: {
                    createMachines: {
                        initial: 'createGameBoard',
                        states: {
                            createGameBoard: {
                                entry: 'createGameBoard',
                                always: 'createUserEmpire',
                                exit: assign({
                                    running: true
                                })
                            },
                            createUserEmpire: {
                                entry: 'createUserEmpire',
                                always: 'createAIEmpires'
                            },
                            createAIEmpires: {
                                entry: 'createAIEmpires',
                                type: 'final'
                            }
                        }
                    },
                    handlingResponses: {
                        initial: 'waitingForResponse',
                        states: {
                            waitingForResponse: {
                                on: {
                                    EMPIRE_READY: {
                                        actions: assign({
                                            machinesReady: (context) => context.machinesReady + 1
                                        }),
                                        target: 'checkingIfReady'
                                    }

                                }
                            },
                            checkingIfReady: {
                                always: [
                                    {
                                        cond: context => context.machinesReady === context.aiEmpireQueue.length + 1,
                                        target: 'ready'
                                    },
                                    {
                                        target: 'waitingForResponse'
                                    }
                                ]
                            },
                            ready: {
                                type: 'final'
                            }
                        }

                    }
                },
                onDone: {
                    target: 'processingUser',
                    actions: send('START_GAME', {
                        to: context => context.gameBoard.ref
                    })
                }
            },
            processingUser: {
                entry: [
                    'moveUserToCurrent',
                    'notifyCurrentMachineToStart'
                ],
                on: {
                    EMPIRE_DONE: {
                        target: 'processingAI',
                        actions: 'resetCurrentEmpire'
                    }
                }
            },
            processingAI: {
                entry: [
                    'moveNextAIToCurrent',
                    'notifyCurrentMachineToStart'
                ],
                on: {
                    EMPIRE_DONE: [
                        {
                            actions: 'empireDone'
                        },
                        {
                            cond: 'allEmpiresDone',
                            target: 'processingTurn'
                        }
                    ]
                },
                exit: [
                    'resetCurrentEmpire',
                    'resetAI'
                ]
            },
            processingTurn: {
                always: 'processingUser'
            },
            over: {}
        }
    },
    {
        guards: {
            allEmpiresDone: context => {
                return context.aiEmpireQueue.length === 0
            }
        },
        actions: {
            createUserEmpire: assign({
                userEmpire: (context) => {
                    const empire = {
                        id: uuid(),
                        empire: empires.empire4,
                        gameBoard: context.gameBoard
                    };
                    return {
                        id: empire.id,
                        ref: spawn(createEmpireMachine(empire))
                    };
                }
            }),
            createAIEmpires: assign({
                aiEmpireQueue: (context) => {
                    let list: MachineRef[] = [];
                    const empire1 = {
                        id: uuid(),
                        empire: empires.empire1,
                        gameBoard: context.gameBoard
                    };
                    list.push({
                        id: empire1.id,
                        ref: spawn(createEmpireMachine(empire1))
                    });

                    const empire2 = {
                        id: uuid(),
                        empire: empires.empire2,
                        gameBoard: context.gameBoard
                    };
                    list.push({
                        id: empire2.id,
                        ref: spawn(createEmpireMachine(empire2))
                    });

                    const empire3 = {
                        id: uuid(),
                        empire: empires.empire3,
                        gameBoard: context.gameBoard
                    };
                    list.push({
                        id: empire3.id,
                        ref: spawn(createEmpireMachine(empire3))
                    });

                    return list;
                }
            }),
            empireDone: assign({
                aiEmpirePile: (context) => {
                    let temp = context.aiEmpirePile;
                    temp.push(context.currentEmpire);
                    return temp;
                }
            }),
            moveUserToCurrent: assign({
                currentEmpire: (context) => context.userEmpire
            }),
            moveNextAIToCurrent: assign({
                currentEmpire: (context) => context.aiEmpireQueue[0],
                aiEmpireQueue: (context) => {
                    let temp = context.aiEmpireQueue;
                    temp.splice(0, 1);
                    return temp;
                }
            }),
            resetAI: assign({
                aiEmpireQueue: (context) => context.aiEmpirePile,
                aiEmpirePile: [] as MachineRef[]
            }),
            resetCurrentEmpire: assign({
                currentEmpire: dummyRef
            }),
            notifyCurrentMachineToStart: send(
                {type: 'TURN'},
                {to: (context: GameContext) => context.currentEmpire.ref}
            )
        }
    });
