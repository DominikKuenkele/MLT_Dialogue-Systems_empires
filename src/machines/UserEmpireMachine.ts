import {
    Action,
    assign,
    createMachine,
    Event,
    EventObject,
    MachineConfig,
    send,
    SendExpr,
    sendParent,
    StatesConfig
} from "xstate";
import {MachineRef} from "../Util";
import {EmpireContext, EmpireEvents} from "./EmpireMachine";

const rasaurl = 'https://speechstate-lt2216-kuenkele.herokuapp.com/model/parse';
const nluRequest = (text: string) =>
    fetch(new Request(rasaurl, {
        method: 'POST',
        body: `{"text": "${text}"}`
    }))
        .then(data => data.json());

function say(text: (context: UserEmpireContext) => string): Action<UserEmpireContext, any> {
    return send((context: UserEmpireContext) => ({
            type: "SPEAK",
            value: text(context)
        }), {
            to: context => context.speechRecognitionMachine.ref
        }
    )
}

function sendToSRM(event: Event<EventObject> | SendExpr<UserEmpireContext, UserEmpireEvents, EventObject>) {
    return send(event, {
        to: (context: UserEmpireContext) => context.speechRecognitionMachine.ref
    })
}

function getPrompts(prompt: ((context: UserEmpireContext) => string)[]): StatesConfig<UserEmpireContext, any, UserEmpireEvents> {
    let state: StatesConfig<UserEmpireContext, any, UserEmpireEvents> = {
        hist: {
            type: 'history'
        }
    };

    for (let number in prompt) {
        state = {
            ...state,
            ['prompt' + number]: {
                entry: say(prompt[number]),
                on: {
                    ENDSPEECH: {
                        target: 'ask' + number,
                    }

                }
            },
            ['ask' + number]: {
                entry: sendToSRM('LISTEN'),
                on: {
                    REPROMPT: {
                        target: parseInt(number) + 1 < prompt.length ? 'prompt' + (parseInt(number) + 1) : 'prompt0'
                    }
                }
            }
        }
    }
    return state;
}


function abstractPromptMachine(prompt: ((context: UserEmpireContext) => string)[]): MachineConfig<UserEmpireContext, any, UserEmpireEvents> {
    return {
        initial: 'prompt0',
        states: {
            ...getPrompts(prompt)
        }
    }
}

export interface UserEmpireContext extends EmpireContext {
    speechRecognitionMachine: MachineRef
    recResult: Hypothesis
}

export type UserEmpireEvents =
    | EmpireEvents
    | { type: 'TTS_READY' }
    | { type: 'RECOGNISED', value: Hypothesis }
    | { type: 'TIMEOUT' }
    | { type: 'ENDSPEECH' }
    | { type: 'REPROMPT' }

export const createUserEmpireMachine = (initialContext: UserEmpireContext) => createMachine<UserEmpireContext, UserEmpireEvents>({
    id: 'userEmpire',
    context: {
        ...initialContext
    },
    initial: 'settingUp',
    states: {
        settingUp: {
            initial: 'registerAtGameBoard',
            states: {
                registerAtGameBoard: {
                    entry: 'registerAtGameBoard',
                    on: {
                        REGISTERED: 'registerAtSRM'
                    }
                },
                registerAtSRM: {
                    entry: 'registerAtSRM',
                    on: {
                        REGISTERED: 'startSRM'
                    }
                },
                startSRM: {
                    entry: sendToSRM('CLICK'),
                    on: {
                        TTS_READY: 'final'
                    }
                },
                final: {
                    entry: sendParent('EMPIRE_READY'),
                    type: 'final'
                }
            },
            onDone: 'waiting'
        },
        turn: {
            initial: 'getCommand',
            states: {
                getCommand: {
                    ...abstractPromptMachine([
                        () => 'What is your move?',
                        () => 'It is your turn.'
                    ]),
                    on: {
                        RECOGNISED: {
                            target: 'parseCommand',
                            actions: assign({
                                recResult: (_c, event) => event.value
                            })
                        },
                        TIMEOUT: {
                            target: '.hist',
                            actions: send('REPROMPT')
                        }
                    }
                },
                parseCommand: {
                    invoke: {
                        src: context => nluRequest(context.recResult.utterance),
                        onDone: [
                            {
                                cond: (_, event) => event.data['intent']['name'] === 'move',
                                target: 'move'
                            },
                            {
                                cond: (_, event) => event.data['intent']['name'] === 'attack',
                                target: 'attack'
                            },
                            {
                                cond: (_, event) => event.data['intent']['name'] === 'request',
                                target: 'request'
                            }
                        ],
                        onError: 'getCommand.hist'

                    }
                },
                move: {},
                attack: {},
                request: {}
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
        registerAtGameBoard: send((context) => ({
                type: 'REGISTER',
                empire: context.empire
            }),
            {
                to: context => context.gameBoard.ref
            }
        ),
        registerAtSRM: sendToSRM('REGISTER')
    }
});
