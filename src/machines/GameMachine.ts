import {assign, createMachine, send, spawn} from "xstate";
import uuid from "uuid-v4";
import {dummyRef, empires, MachineRef} from "../Util";
import {createEmpireMachine} from "./EmpireMachine";
import {createUserEmpireMachine} from "./UserEmpireMachine";

interface GameContext {
    userEmpire: MachineRef,
    currentEmpire: MachineRef,
    aiEmpireQueue: MachineRef[],
    aiEmpirePile: MachineRef[],
    gameBoard: MachineRef,

    speechRecognitionMachine: MachineRef,
    machinesReady: number,
    turn: number
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
    } |
    {
        type: 'SEND_LIVING_EMPIRES',
        empires: empires[]
    };


export const gameMachine = (speechRecognitionMachine: MachineRef) => createMachine<GameContext, GameEvents>({
        id: 'game',
        context: {
            userEmpire: dummyRef,
            aiEmpireQueue: [],
            aiEmpirePile: [],
            currentEmpire: dummyRef,
            gameBoard: dummyRef,
            machinesReady: 0,
            turn: 1,
            speechRecognitionMachine: speechRecognitionMachine
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
                                always: 'createUserEmpire'
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
                    'notifyGameBoardCurrentEmpire',
                    'notifyCurrentMachineToStart',
                ],
                on: {
                    EMPIRE_DONE: {
                        target: 'processingTurn',
                        actions: [
                            'notifyGameBoardEndTurn',
                            'resetCurrentEmpire'
                        ]
                    }
                }
            },
            processingAI: {
                entry: [
                    'moveNextAIToCurrent',
                    'notifyGameBoardCurrentEmpire',
                    'notifyCurrentMachineToStart'
                ],
                on: {
                    EMPIRE_DONE: [
                        {
                            actions: [
                                'notifyGameBoardEndTurn',
                                'empireDone',
                                'notifyGameBoardCurrentEmpire',
                            ]
                        },
                        {
                            cond: 'allEmpiresDone',
                            target: 'processingTurn'
                        }
                    ]
                },
                exit: [
                    'resetCurrentEmpire',
                    'resetAI',
                    'notifyGameBoardEndTurn',
                ]
            },
            processingTurn: {
                entry: send('REQ_LIVING_EMPIRES', {
                    to: context => context.gameBoard.ref
                }),
                on: {
                    SEND_LIVING_EMPIRES: [
                        {
                            target: 'lost',
                            cond: 'userEmpireDead'
                        },
                        {
                            target: 'won',
                            cond: 'oneEmpireLiving'
                        },
                        {
                            target: 'processingUser',
                            actions: assign({
                                turn: context => context.turn + 1
                            })

                        }
                    ]
                }
            },
            won: {
                type: 'final'
            },
            lost: {
                type: 'final'
            }
        }
    },
    {
        guards: {
            userEmpireDead: (context, event) => !event.empires.includes(context.userEmpire.ref.getSnapshot().context.empire),
            oneEmpireLiving: (context, event) => event.empires.length === 1,
            allEmpiresDone: context => context.aiEmpireQueue.length === 0
        },
        actions: {
            notifyGameBoardCurrentEmpire: send((context) => ({
                type: 'START_TURN',
                empire: context.currentEmpire.ref.getSnapshot().context.empire,
                turn: context.turn
            }), {to: context => context.gameBoard.ref}),
            notifyGameBoardEndTurn: send('END_TURN', {to: context => context.gameBoard.ref}),
            createUserEmpire: assign({
                userEmpire: (context) => {
                    const empire = {
                        id: uuid(),
                        empire: empires.empire4,
                        gameBoard: context.gameBoard,
                    };
                    return {
                        id: empire.id,
                        ref: spawn(createUserEmpireMachine(empire, context.speechRecognitionMachine), 'userEmpire')
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
                        ref: spawn(createEmpireMachine(empire1), empires.empire1)
                    });

                    // const empire2 = {
                    //     id: uuid(),
                    //     empire: empires.empire2,
                    //     gameBoard: context.gameBoard
                    // };
                    // list.push({
                    //     id: empire2.id,
                    //     ref: spawn(createEmpireMachine(empire2))
                    // });
                    //
                    // const empire3 = {
                    //     id: uuid(),
                    //     empire: empires.empire3,
                    //     gameBoard: context.gameBoard
                    // };
                    // list.push({
                    //     id: empire3.id,
                    //     ref: spawn(createEmpireMachine(empire3))
                    // });

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
