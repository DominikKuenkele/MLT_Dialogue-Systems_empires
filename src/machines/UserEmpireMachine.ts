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
import {getUnitByString, units} from "../components/Unit";

const rasaurl = 'http://localhost:5005/model/parse';
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
    extractor: string,
    role: string
}

const binaryGrammar = {
    "Yes": ["Yes.", "Of course.", "Sure.", "Yeah.", "Yes please.", "Yep.", "OK.", "Yes, thank you."],
    "No": ["No.", "Nope.", "No no.", "Don't.", "Don't do it.", "No way.", "Not at all."]
};

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

function binaryPromptMachine(prompt: ((context: UserEmpireContext) => string)[]): MachineConfig<UserEmpireContext, any, UserEmpireEvents> {
    return {
        ...abstractPromptMachine(prompt),
        on: {
            RECOGNISED: [
                {
                    actions: send('YES'),
                    cond: (_, event) => binaryGrammar["Yes"].includes(event.value.utterance)
                },
                {
                    actions: send('NO'),
                    cond: (_, event) => binaryGrammar["No"].includes(event.value.utterance)
                },
                {
                    target: '.nomatch'
                }
            ],
            TIMEOUT: {
                target: '.hist',
                actions: send('HIST')
            }
        }
    };
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

type productionCommandType = {
    utterance: {
        unitType: string
    },
    translated: {
        unitType: units | undefined
    }
}

export interface UserEmpireContext extends EmpireContext {
    speechRecognitionMachine: MachineRef
    recResult: Hypothesis,
    errorMessage: string,
    command: commandType,
    productionCommand: productionCommandType,
    moves: {
        production: boolean,
        units: []
    }
}

export type UserEmpireEvents =
    | EmpireEvents
    | { type: 'TTS_READY' }
    | { type: 'RECOGNISED', value: Hypothesis }
    | { type: 'TIMEOUT' }
    | { type: 'ENDSPEECH' }
    | { type: 'REPROMPT' }

    | { type: 'MOVES', moves: { production: boolean, units: [] } }

export const createUserEmpireMachine = (empireContext: EmpireContext, srm: MachineRef) => createMachine<UserEmpireContext, UserEmpireEvents>({
        id: 'userEmpire',
        context: {
            ...empireContext,
            speechRecognitionMachine: srm,
            recResult: {} as Hypothesis,
            errorMessage: '',
            command: {} as commandType,
            productionCommand: {} as productionCommandType,
            moves: {
                production: false,
                units: []
            }
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
                            REGISTERED: 'final'
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
                initial: 'startUtterance',
                states: {
                    startUtterance: {
                        entry: say(() => 'It is our turn now.'),
                        on: {
                            ENDSPEECH: 'fetchMoves'
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
                                target: 'getCommand'
                            },
                            {
                                target: 'final'
                            }
                        ]
                    },
                    getCommand: {
                        ...abstractPromptMachine([
                            () => 'What shall we do?',
                            (context) => {
                                let utterances = [];
                                for (let unit of context.moves.units) {
                                    utterances.push(`We could move the ${unit.type}`)
                                }
                                context.moves.production && utterances.push('We could train a unit.')
                                return utterances[Math.floor(Math.random() * utterances.length)]
                            }
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
                                },
                                {
                                    cond: (_, event) => event.data['intent']['name'] === 'skip_round',
                                    target: 'skip'
                                },
                                {
                                    target: 'getCommand.nomatch'
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
                                            cond: (context, event) => event.data['intent']['name'] === 'exit_question',
                                            target: 'final'
                                        },
                                        {
                                            actions: assign({
                                                command: (context, event) => {
                                                    let unit: rasa_response_entity = event.data['entities'].find((element: rasa_response_entity) => element.entity === 'unit' && element.role === 'source')
                                                    let target: rasa_response_entity = event.data['entities'].find((element: rasa_response_entity) => element.entity === 'field' && element.role === 'target')

                                                    return {
                                                        utterance: {
                                                            sourceUnit: unit && unit.value ? unit.value.toLowerCase() : context.command.utterance.sourceUnit,
                                                            target: target && target.value ? target.value : context.command.utterance.target
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
                                            errorMessage: "I couldn't find the unit. Which unit did you mean?"
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
                                entry: send(
                                    context => ({
                                        type: 'MOVE', ...context.command.translated
                                    }), {
                                        to: context => context.gameBoard.ref
                                    }),
                                on: {
                                    OCC_ALLY: {
                                        target: 'final',
                                        actions: say(() => "There is one of ours, sire")
                                    },
                                    OCC_ENEMY: {
                                        target: 'final',
                                        actions: say(() => "The enemy is already there, milord.")
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
                        onDone: 'fetchMoves'
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
                                            cond: (context, event) => event.data['intent']['name'] === 'exit_question',
                                            target: 'final'
                                        },
                                        {
                                            actions: assign({
                                                command: (context, event) => {
                                                    let unit: rasa_response_entity = event.data['entities'].find((element: rasa_response_entity) => element.entity === 'unit' && element.role === 'source')
                                                    let target: rasa_response_entity = event.data['entities'].find((element: rasa_response_entity) => element.entity === 'field' && element.role === 'target')

                                                    return {
                                                        utterance: {
                                                            sourceUnit: unit && unit.value ? unit.value : context.command.utterance.sourceUnit,
                                                            target: target && target.value ? target.value : context.command.utterance.target
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
                        onDone: 'fetchMoves'
                    },
                    produce: {
                        initial: 'parseUtterance',
                        entry: 'resetProductionCommand',
                        states: {
                            fetchInformation: {
                                initial: 'getUnitType',
                                states: {
                                    hist: {
                                        type: 'history'
                                    },
                                    getUnitType: {
                                        ...formFillingPromptMachine(
                                            [() => 'Which unit do you want to train?'],
                                            (context) => context.productionCommand.utterance.unitType !== '',
                                            'final',
                                            'produce~parseUtterance')
                                    },
                                    final: {
                                        type: 'final'
                                    }
                                },
                                onDone: 'translateUnitType'
                            },
                            parseUtterance: {
                                id: 'produce~parseUtterance',
                                invoke: {
                                    src: context => nluRequest(context.recResult.utterance),
                                    onDone: [
                                        {
                                            cond: (context, event) => event.data['intent']['name'] === 'exit_question',
                                            target: 'final'
                                        },
                                        {
                                            actions: assign({
                                                productionCommand: (context, event) => {
                                                    let unit: rasa_response_entity = event.data['entities'].find((element: rasa_response_entity) => element.entity === 'unit')

                                                    return {
                                                        utterance: {
                                                            unitType: unit && unit.value ? unit.value : context.productionCommand.utterance.unitType,
                                                        },
                                                        translated: {
                                                            ...context.productionCommand.translated
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
                            translateUnitType: {
                                always: [
                                    {
                                        cond: 'validateUnitType',
                                        actions: 'translateUnitType',
                                        target: 'executeProduction'
                                    },
                                    {
                                        actions: assign(context => ({
                                            productionCommand: {
                                                ...context.productionCommand,
                                                utterance: {
                                                    unitType: ''
                                                }
                                            },
                                            errorMessage: "I did not understand, who you want to train?"
                                        })),
                                        target: 'errorMessage',
                                    }
                                ]
                            },
                            executeProduction: {
                                entry: [
                                    send(context => ({
                                        type: 'PRODUCE',
                                        unit: context.productionCommand.translated.unitType
                                    }), {
                                        to: context => context.gameBoard.ref
                                    })],
                                on: {
                                    PROD_IN_PROGRESS: {
                                        target: 'final',
                                        actions: say(() => "We already produce a unit")
                                    },
                                    EXECUTED: 'final'
                                },
                                exit: 'resetProductionCommand'
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
                        onDone: 'fetchMoves',
                    },
                    request: {
                        always: 'fetchMoves'
                    },
                    skip: {
                        initial: 'checkIfMovesLeft',
                        states: {
                            checkIfMovesLeft: {
                                always: [
                                    {
                                        cond: 'movesLeft',
                                        target: 'verification'
                                    },
                                    {
                                        actions: send('YES')
                                    }
                                ]
                            },
                            verification: {
                                ...binaryPromptMachine([
                                    (context) => `${context.moves.production ? 'You could produce a unit.' : 'You could move a unit.'} Still want to do nothing?`,
                                    () => 'Do you want to skip this round?'
                                ])
                            }
                        },
                        on: {
                            YES: 'final',
                            NO: 'fetchMoves'
                        }
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
            resetProductionCommand: assign<UserEmpireContext>({
                productionCommand: {
                    utterance: {unitType: ''},
                    translated: {unitType: undefined}
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
            translateUnitType: assign<UserEmpireContext>({
                productionCommand: (context) => {
                    return {
                        ...context.productionCommand,
                        translated: {
                            unitType: getUnitByString(context.productionCommand.utterance.unitType)!
                        }
                    }
                }
            }),
            translateSourceUnit: assign<UserEmpireContext>({
                command: context => {
                    let unit_type: units = getUnitByString(context.command.utterance.sourceUnit)!

                    if (unit_type) {
                        let unit = context.moves.units.find(unit => unit.type === unit_type);
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
            movesLeft: (context) => context.moves.units.length > 0 || context.moves.production,
            validateSourceUnit: (context: UserEmpireContext) => {
                let unit_type: units = getUnitByString(context.command.utterance.sourceUnit)!


                if (unit_type) {
                    let unit = context.moves.units.find(unit => unit.type === unit_type);
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
            },
            validateUnitType: (context: UserEmpireContext) => {
                let producable = [units.Archer, units.Spearman, units.Horseman]
                let unitType = getUnitByString(context.productionCommand.utterance.unitType)

                return unitType && producable.includes(unitType)
            }
        }
    }
);
