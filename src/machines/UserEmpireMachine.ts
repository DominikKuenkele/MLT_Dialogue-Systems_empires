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
import {units} from "../components/Unit";

const rasaurl = 'https://empires-kuenkele.herokuapp.com/model/parse';
const nluRequest = (text: string) =>
    fetch(new Request(rasaurl, {
        method: 'POST',
        body: `{"text": "${text}"}`
    }))
        .then(data => data.json());

type rasa_response_entity = {
    entity: string,
    start: number,
    end: number,
    value: string,
    extractor: string
}

const unitGrammar = [
    {
        unit: units.Archer,
        patterns: [
            /archer/,
            /bowman/
        ]
    },
    {
        unit: units.Horseman,
        patterns: [
            /horsem[ae]n/,
            /knight/,
            /rider/,
            /cavalry/
        ]
    },
    {
        unit: units.Spearman,
        patterns: [
            /spear ?m[ae]n/,
            /lance/
        ]
    }
]

const machineAnswers: { [index: string]: Array<string> } = {
    "CR": [
        "Sorry, could you please repeat that?",
        "I didn't catch that?",
        "What did you say?",
        "Come again?",
        "Sorry?",
        "Huh?"
    ]
}

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
        },
        nomatch: {
            entry: say(() => machineAnswers["CR"][Math.random() * machineAnswers["CR"].length | 0]),
            on: {ENDSPEECH: 'ask0'}
        },
        final: {
            type: 'final'
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

function formFillingPromptMachine(prompt: [(context: UserEmpireContext) => string],
                                  condition: (context: UserEmpireContext) => boolean,
                                  target: string,
                                  parserId: string): MachineConfig<UserEmpireContext, any, UserEmpireEvents> {
    return {
        initial: 'init',
        states: {
            ...getPrompts(prompt),
            init: {
                always: [
                    {
                        target: 'final',
                        cond: condition
                    },
                    {
                        target: 'prompt0'
                    }
                ]
            }
        },
        on: {
            RECOGNISED: {
                target: `#${parserId}`,
                actions: assign({
                    recResult: (_c, event) => event.value
                })
            },
            TIMEOUT: '.prompt0'
        },
        onDone: target
    }
}

function abstractPromptMachine(prompt: ((context: UserEmpireContext) => string)[]): MachineConfig<UserEmpireContext, any, UserEmpireEvents> {
    return {
        initial: 'prompt0',
        states: {
            ...getPrompts(prompt)
        }
    }
}

type commandType = {
    utterance: {
        sourceUnit: string,
        target: string
    },
    translated: {
        id: string,
        x: number,
        y: number
    }
}

export interface UserEmpireContext extends EmpireContext {
    speechRecognitionMachine: MachineRef
    recResult: Hypothesis,
    errorMessage: string,
    command: commandType,
    units: []
}

export type UserEmpireEvents =
    | EmpireEvents
    | { type: 'TTS_READY' }
    | { type: 'RECOGNISED', value: Hypothesis }
    | { type: 'TIMEOUT' }
    | { type: 'ENDSPEECH' }
    | { type: 'REPROMPT' }

    | { type: 'UNITS', units: [] }

export const createUserEmpireMachine = (empireContext: EmpireContext, srm: MachineRef) => createMachine<UserEmpireContext, UserEmpireEvents>({
        id: 'userEmpire',
        context: {
            ...empireContext,
            speechRecognitionMachine: srm,
            recResult: {} as Hypothesis,
            errorMessage: '',
            command: {} as commandType,
            units: []
        },
        initial: 'settingUp',
        states: {
            settingUp: {
                entry: assign({}),
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
                initial: 'fetchMovableUnits',
                states: {
                    fetchMovableUnits: {
                        entry: send(context => ({
                                type: 'GET_MOVES',
                                empire: context.empire
                            }), {
                                to: context => context.gameBoard.ref
                            }
                        ),
                        on: {
                            UNITS: [
                                {
                                    cond: (_, event) => event.units.length > 0,
                                    target: 'getCommand',
                                    actions: assign({
                                        units: (_c, event: UserEmpireEvents) => event.units
                                    })
                                },
                                {
                                    target: 'final'
                                }
                            ]

                        }
                    },
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
                                },
                                {
                                    cond: (_, event) => event.data['intent']['name'] === 'produce',
                                    target: 'produce'
                                }
                            ],
                            onError: 'getCommand.hist'

                        }
                    },
                    move: {
                        initial: 'parseUtterance',
                        entry: 'resetCommand',
                        states: {
                            fetchInformation: {
                                initial: 'getSourceUnit',
                                states: {
                                    hist: {
                                        type: 'history'
                                    },
                                    getSourceUnit: {
                                        ...formFillingPromptMachine(
                                            [() => 'Which unit?'],
                                            (context) => context.command.utterance.sourceUnit !== '',
                                            'getTarget',
                                            'move~parseUtterance')
                                    },
                                    getTarget: {
                                        ...formFillingPromptMachine(
                                            [() => 'Where do you want to move it?'],
                                            (context) => context.command.utterance.target !== '',
                                            'final',
                                            'move~parseUtterance')
                                    },
                                    final: {
                                        type: 'final'
                                    }
                                },
                                onDone: 'translateSourceUnit'
                            },
                            parseUtterance: {
                                id: 'move~parseUtterance',
                                invoke: {
                                    src: context => nluRequest(context.recResult.utterance),
                                    onDone: [
                                        {
                                            actions: assign({
                                                command: (context, event) => {
                                                    // let unit: rasa_response_entity = event.data['entities'].find((element: rasa_response_entity) => element.entity === 'sourceUnit')
                                                    // let target: rasa_response_entity = event.data['entities'].find((element: rasa_response_entity) => element.entity === 'targetField')

                                                    // return {
                                                    //     sourceUnit: unit && unit.value ? unit.value : context.command.sourceUnit,
                                                    //     target: target && target.value ? target.value : context.command.target
                                                    // }
                                                    let pattern = /(Move the (.*?))? ?((Move it to|to) (.*?))?\./;
                                                    let regexExec = pattern.exec(`${context.recResult.utterance}${context.recResult.utterance.endsWith('.') ? '' : '.'}`)
                                                    return {
                                                        utterance: {
                                                            sourceUnit: (regexExec && regexExec[2]) || context.command.utterance.sourceUnit,
                                                            target: (regexExec && regexExec[5]) || context.command.utterance.target,
                                                        },
                                                        translated: {
                                                            ...context.command.translated
                                                        }
                                                    }
                                                }
                                            }),
                                            target: 'fetchInformation.hist'
                                        }
                                    ],
                                    onError: 'fetchInformation.hist'
                                }
                            },
                            translateSourceUnit: {
                                always: [
                                    {
                                        cond: 'validateSourceUnit',
                                        actions: 'translateSourceUnit',
                                        target: 'checkTargetField'
                                    },
                                    {
                                        actions: assign(context => ({
                                            command: {
                                                ...context.command,
                                                utterance: {
                                                    ...context.command.utterance,
                                                    sourceUnit: ''
                                                }
                                            },
                                            errorMessage: "I couldn't find the unit. Could you specify it more?"
                                        })),
                                        target: 'errorMessage',
                                    }
                                ]
                            },
                            checkTargetField: {
                                always: [
                                    {
                                        cond: 'validateTargetField',
                                        actions: 'translateTargetField',
                                        target: 'executeMove'
                                    },
                                    {
                                        actions: assign((context) => ({
                                            command: {
                                                ...context.command,
                                                utterance: {
                                                    ...context.command.utterance,
                                                    target: ''
                                                }
                                            },
                                            errorMessage: "I couldn't find the field. Could you repeat it?"
                                        })),
                                        target: 'fetchInformation',
                                    }
                                ]
                            },
                            executeMove: {
                                entry: [
                                    context => console.log(context.command),
                                    send(
                                        context => ({
                                            type: 'MOVE', ...context.command.translated
                                        }), {
                                            to: context => context.gameBoard.ref
                                        })],
                                on: {
                                    OCC_ALLY: {
                                        target: 'final',
                                        actions: say(() => "There is one of ours, sire")
                                    },
                                    OCC_ENEMY: {
                                        target: 'final',
                                        actions: say(() => "The enemy is already there, mlord.")
                                    },
                                    OUT_OF_RANGE: {
                                        target: 'final',
                                        actions: say(() => "We can't move so far.")
                                    },
                                    EXECUTED: 'final'
                                },
                                exit: 'resetCommand'
                            },
                            errorMessage: {
                                ...abstractPromptMachine([(context) => context.errorMessage]),
                                on: {
                                    RECOGNISED: {
                                        target: 'parseUtterance',
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
                            final: {
                                type: 'final'
                            }
                        },
                        onDone: 'fetchMovableUnits'
                    },
                    attack: {
                        initial: 'parseUtterance',
                        entry: 'resetCommand',
                        states: {
                            fetchInformation: {
                                initial: 'getSourceUnit',
                                states: {
                                    hist: {
                                        type: 'history'
                                    },
                                    getSourceUnit: {
                                        ...formFillingPromptMachine(
                                            [() => 'Which unit should attack?'],
                                            (context) => context.command.utterance.sourceUnit !== '',
                                            'getTarget',
                                            'attack~parseUtterance')
                                    },
                                    getTarget: {
                                        ...formFillingPromptMachine(
                                            [() => 'Who should be attacked?'],
                                            (context) => context.command.utterance.target !== '',
                                            'final',
                                            'attack~parseUtterance')
                                    },
                                    final: {
                                        type: 'final'
                                    }
                                },
                                onDone: 'translateSourceUnit'
                            },
                            parseUtterance: {
                                id: 'attack~parseUtterance',
                                invoke: {
                                    src: context => nluRequest(context.recResult.utterance),
                                    onDone: [
                                        {
                                            actions: assign({
                                                command: (context, event) => {
                                                    let pattern = /(Attack (the .*? on )?(.*?))?( ?[Ww]ith the (.*?))?\./;
                                                    let regexExec = pattern.exec(`${context.recResult.utterance}${context.recResult.utterance.endsWith('.') ? '' : '.'}`)
                                                    return {
                                                        utterance: {
                                                            sourceUnit: (regexExec && regexExec[5]) || context.command.utterance.sourceUnit,
                                                            target: (regexExec && regexExec[3]) || context.command.utterance.target,
                                                        },
                                                        translated: {
                                                            ...context.command.translated
                                                        }
                                                    }
                                                }
                                            }),
                                            target: 'fetchInformation.hist'
                                        }
                                    ],
                                    onError: 'fetchInformation.hist'
                                }
                            },
                            translateSourceUnit: {
                                always: [
                                    {
                                        cond: 'validateSourceUnit',
                                        actions: 'translateSourceUnit',
                                        target: 'checkTargetField'
                                    },
                                    {
                                        actions: assign(context => ({
                                            command: {
                                                ...context.command,
                                                utterance: {
                                                    ...context.command.utterance,
                                                    sourceUnit: ''
                                                }
                                            },
                                            errorMessage: "I am not sure who should attack?"
                                        })),
                                        target: 'errorMessage',
                                    }
                                ]
                            },
                            checkTargetField: {
                                always: [
                                    {
                                        cond: 'validateTargetField',
                                        actions: 'translateTargetField',
                                        target: 'executeAttack'
                                    },
                                    {
                                        actions: assign((context) => ({
                                            command: {
                                                ...context.command,
                                                utterance: {
                                                    ...context.command.utterance,
                                                    target: ''
                                                }
                                            },
                                            errorMessage: "I couldn't find the field. Could you repeat it?"
                                        })),
                                        target: 'fetchInformation',
                                    }
                                ]
                            },
                            executeAttack: {
                                entry: [
                                    send(
                                        context => ({
                                            type: 'ATTACK', ...context.command.translated
                                        }), {
                                            to: context => context.gameBoard.ref
                                        })],
                                on: {
                                    OCC_ALLY: {
                                        target: 'final',
                                        actions: say(() => "My lord, we should not attack ourselves.")
                                    },
                                    OCC_NOT: {
                                        target: 'final',
                                        actions: say(() => "But there is noone!")
                                    },
                                    OUT_OF_RANGE: {
                                        target: 'final',
                                        actions: say(() => "They are too far away, my liege!")
                                    },
                                    EXECUTED: 'final'
                                },
                                exit: 'resetCommand'
                            },
                            errorMessage: {
                                ...abstractPromptMachine([(context) => context.errorMessage]),
                                on: {
                                    RECOGNISED: {
                                        target: 'parseUtterance',
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
                            final: {
                                type: 'final'
                            }
                        },
                        onDone: 'fetchMovableUnits'
                    },
                    produce: {
                        always: 'fetchMovableUnits'
                    },
                    request: {
                        always: 'fetchMovableUnits'
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
    },
    {
        actions: {
            resetCommand: assign<UserEmpireContext>({
                command: {
                    utterance: {sourceUnit: '', target: ''},
                    translated: {id: '', x: 0, y: 0}
                }
            }),
            registerAtGameBoard: send((context: UserEmpireContext) => ({
                    type: 'REGISTER',
                    empire: context.empire
                }),
                {
                    to: context => context.gameBoard.ref
                }
            ),
            registerAtSRM: sendToSRM('REGISTER'),
            translateTargetField: assign<UserEmpireContext>({
                command: (context) => {
                    let pattern = /([A-Z]*)(\d*)/;
                    let regexExec = pattern.exec(context.command.utterance.target)!;

                    return {
                        ...context.command,
                        translated: {
                            ...context.command.translated,
                            x: (parseInt(regexExec[1], 36) - 10),
                            y: parseInt(regexExec[2]) - 1
                        }
                    }
                }
            }),
            translateSourceUnit: assign<UserEmpireContext>({
                command: context => {
                    let reqUnit = context.command.utterance.sourceUnit.toLowerCase().trim()
                    let type: units | undefined;

                    for (let unit of unitGrammar) {
                        if (unit.patterns.some(pattern => pattern.test(reqUnit))) {
                            type = unit.unit;
                            break;
                        }
                    }

                    if (type) {
                        let unit = context.units.find(unit => unit.type === type);
                        if (unit) {
                            return {
                                ...context.command,
                                translated: {
                                    ...context.command.translated,
                                    id: unit.id
                                }
                            }
                        }
                    }
                    return context.command;
                }
            })
        },
        guards: {
            validateSourceUnit: (context: UserEmpireContext) => {
                let reqUnit = context.command.utterance.sourceUnit.toLowerCase().trim()
                let type: units | undefined;

                for (let unit of unitGrammar) {
                    if (unit.patterns.some(pattern => pattern.test(reqUnit))) {
                        type = unit.unit;
                        break;
                    }
                }

                if (type) {
                    let unit = context.units.find(unit => unit.type === type);
                    if (unit) {
                        return true
                    }
                }
                return false;
            },
            validateTargetField: (context: UserEmpireContext) => {
                let pattern = /([A-Z]*)(\d*)/;
                let regexExec = pattern.exec(context.command.utterance.target)!;
                return regexExec[1] && regexExec[2]
            }

        }
    }
);
