import {assign, createMachine, send, sendParent, StatesConfig} from "xstate";
import {MachineRef} from "../Util";
import {EmpireContext, EmpireEvents, EmpireUnitMoveEvent, initialEmpireContext, moveType} from "./EmpireMachine";
import {getUnitByString, units} from "../components/Unit";
import {archerContext, horsemanContext, spearmanContext} from "./UnitMachine";
import {
    abstractPromptMachine,
    binaryPromptMachine,
    formFillingPromptMachine,
    nluRequest,
    rasa_response_entity,
    say,
    sendToSRM
} from "../DialogueUtil";


type commandTranslatorType = {
    utterance: {
        sourceUnit: string,
        target: string
        unitType: string
    },
    translated: {
        unitType: units | undefined
        id: string,
        x: number,
        y: number
    }
}

type commandProposal = {
    type: moveType,
    id: string,
    x: number,
    y: number
}

export interface UserEmpireContext extends EmpireContext {
    speechRecognitionMachine: MachineRef
    recResult: Hypothesis,
    errorMessage: string,
    commandTranslator: commandTranslatorType
    proposedCommand: commandProposal | undefined
}

export type UserEmpireEvents =
    | EmpireEvents
    | { type: 'TTS_READY' }
    | { type: 'RECOGNISED', value: Hypothesis }
    | { type: 'TIMEOUT' }
    | { type: 'ENDSPEECH' }
    | { type: 'REPROMPT' }

export const createUserEmpireMachine = (empireContext: initialEmpireContext, srm: MachineRef) => createMachine<UserEmpireContext, UserEmpireEvents>({
        id: 'userEmpire',
        context: {
            ...empireContext,
            speechRecognitionMachine: srm,
            recResult: {} as Hypothesis,
            errorMessage: '',
            commandTranslator: {} as commandTranslatorType,
            moves: {
                production: false,
                units: []
            },
            proposedCommand: undefined
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
                                    cond: (_, event) => event.data['intent']['name'] === 'produce',
                                    target: 'produce'
                                },
                                {
                                    cond: (_, event) => event.data['intent']['name'] === 'skip_round',
                                    target: 'skip'
                                },
                                {
                                    cond: (_, event) => event.data['intent']['name'] === 'request_turn',
                                    target: 'request_turn'
                                },
                                {
                                    cond: (_, event) => event.data['intent']['name'] === 'request_unit_move_range',
                                    target: 'request_unit_move_range'
                                },
                                {
                                    cond: (_, event) => event.data['intent']['name'] === 'request_moves',
                                    target: 'request_moves'
                                },
                                {
                                    cond: (_, event) => event.data['intent']['name'] === 'approve',
                                    target: 'approve'
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
                        entry: 'resetCommandTranslator',
                        states: {
                            ...motionStateNode(
                                'move',
                                [
                                    () => 'Which unit should move?',
                                    () => 'Who should move?'
                                ],
                                [
                                    () => 'Where do you want to move it?',
                                    () => 'What is the target?'
                                ],
                                "I am not sure, who should move.",
                                "I couldn't find the field. Could you repeat it?"
                            ),
                            execute: {
                                entry: send(
                                    context => ({
                                        type: 'MOVE',
                                        id: context.commandTranslator.translated.id,
                                        x: context.commandTranslator.translated.x,
                                        y: context.commandTranslator.translated.y
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
                                    EXECUTED: {
                                        target: 'final',
                                        actions: say((context) => `Ok, moving it to ${context.commandTranslator.utterance.target}`)
                                    }
                                }
                            }
                        },
                        onDone: 'fetchMoves'
                    },
                    attack: {
                        initial: 'parseUtterance',
                        entry: 'resetCommandTranslator',
                        states: {
                            ...motionStateNode(
                                'attack',
                                [() => 'Which unit should attack?'],
                                [() => 'Who should be attacked?'],
                                "I am not sure who should attack?",
                                "I couldn't find the field. Could you repeat it?"
                            ),
                            execute: {
                                entry: send(
                                    context => ({
                                        type: 'ATTACK',
                                        id: context.commandTranslator.translated.id,
                                        x: context.commandTranslator.translated.x,
                                        y: context.commandTranslator.translated.y,
                                    }), {
                                        to: context => context.gameBoard.ref
                                    }),
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
                                    EXECUTED: {
                                        target: 'final',
                                        actions: say(() => `We will attack the unit`)
                                    }
                                }
                            }
                        },
                        onDone: 'fetchMoves'
                    },
                    produce: {
                        initial: 'parseUtterance',
                        entry: 'resetCommandTranslator',
                        states: {
                            fetchInformation: {
                                initial: 'getUnitType',
                                states: {
                                    hist: {
                                        type: 'history'
                                    },
                                    getUnitType: {
                                        ...formFillingPromptMachine(
                                            [
                                                () => 'Which unit do you want to train?',
                                                () => 'Which unit?'
                                            ],
                                            (context) => context.commandTranslator.utterance.unitType !== '',
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
                                                commandTranslator: (context, event) => {
                                                    let unit: rasa_response_entity = event.data['entities'].find((element: rasa_response_entity) => element.entity === 'unit')

                                                    return {
                                                        utterance: {
                                                            ...context.commandTranslator.utterance,
                                                            unitType: unit && unit.value ? unit.value : context.commandTranslator.utterance.unitType,
                                                        },
                                                        translated: {
                                                            ...context.commandTranslator.translated
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
                                            commandTranslator: {
                                                ...context.commandTranslator,
                                                utterance: {
                                                    ...context.commandTranslator.utterance,
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
                                        unit: context.commandTranslator.translated.unitType
                                    }), {
                                        to: context => context.gameBoard.ref
                                    })],
                                on: {
                                    PROD_IN_PROGRESS: {
                                        target: 'final',
                                        actions: say(() => "We already produce a unit")
                                    },
                                    EXECUTED: {
                                        target: 'final',
                                        actions: say((context) => `The ${context.commandTranslator.utterance.unitType} will soon be ready!`)
                                    }
                                }
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
                    request_turn: {
                        entry: send('REQ_TURN', {
                            to: context => context.gameBoard.ref
                        }),
                        on: {
                            RES_TURN: {
                                target: 'fetchMoves',
                                actions: say((_, event) => `It is the turn ${event.turn}`)
                            }
                        }
                    },
                    request_moves: {
                        initial: 'parseUtterance',
                        entry: 'resetCommandTranslator',
                        states: {
                            fetchInformation: {
                                initial: 'getSourceUnit',
                                states: {
                                    hist: {
                                        type: 'history'
                                    },
                                    getSourceUnit: {
                                        ...formFillingPromptMachine(
                                            [
                                                () => 'Which unit do you mean?',
                                                () => 'What is the unit?'
                                            ],
                                            (context) => context.commandTranslator.utterance.sourceUnit !== '',
                                            'final',
                                            `req_move~parseUtterance`)
                                    },
                                    final: {
                                        type: 'final'
                                    }
                                },
                                onDone: 'translateSourceUnit'
                            },
                            parseUtterance: {
                                id: `req_move~parseUtterance`,
                                invoke: {
                                    src: context => nluRequest(context.recResult.utterance),
                                    onDone: [
                                        {
                                            cond: (context, event) => event.data['intent']['name'] === 'exit_question',
                                            target: 'final'
                                        },
                                        {
                                            actions: assign({
                                                commandTranslator: (context, event) => {
                                                    let unit: rasa_response_entity = event.data['entities'].find((element: rasa_response_entity) => element.entity === 'unit')

                                                    return {
                                                        utterance: {
                                                            ...context.commandTranslator.utterance,
                                                            sourceUnit: unit && unit.value ? unit.value.toLowerCase() : context.commandTranslator.utterance.sourceUnit,
                                                        },
                                                        translated: {
                                                            ...context.commandTranslator.translated
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
                                        target: 'execute'
                                    },
                                    {
                                        actions: assign(context => ({
                                            commandTranslator: {
                                                ...context.commandTranslator,
                                                utterance: {
                                                    ...context.commandTranslator.utterance,
                                                    sourceUnit: ''
                                                }
                                            },
                                            errorMessage: "I couldn't find this unit. Which do you mean?"
                                        })),
                                        target: 'errorMessage',
                                    }
                                ]
                            },
                            execute: {
                                entry: send(
                                    context => ({
                                        type: 'REQ_MOVES_FOR_UNIT',
                                        id: context.commandTranslator.translated.id,
                                    }), {
                                        to: context => context.gameBoard.ref
                                    }),
                                on: {
                                    POSSIBLE_MOVES: {
                                        target: 'final',
                                        actions: [
                                            'storeProposedCommand',
                                            'proposeCommand'
                                        ]
                                    },
                                }
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
                    request_unit_move_range: {
                        initial: 'parseUtterance',
                        entry: 'resetCommandTranslator',
                        states: {
                            fetchInformation: {
                                initial: 'getUnitType',
                                states: {
                                    hist: {
                                        type: 'history'
                                    },
                                    getUnitType: {
                                        ...formFillingPromptMachine(
                                            [() => 'Which unit do you mean?'],
                                            (context) => context.commandTranslator.utterance.unitType !== '',
                                            'final',
                                            'unit-range~parseUtterance')
                                    },
                                    final: {
                                        type: 'final'
                                    }
                                },
                                onDone: 'translateUnitType'
                            },
                            parseUtterance: {
                                id: 'unit-range~parseUtterance',
                                invoke: {
                                    src: context => nluRequest(context.recResult.utterance),
                                    onDone: [
                                        {
                                            cond: (context, event) => event.data['intent']['name'] === 'exit_question',
                                            target: 'final'
                                        },
                                        {
                                            actions: assign({
                                                commandTranslator: (context, event) => {
                                                    let unit: rasa_response_entity = event.data['entities'].find((element: rasa_response_entity) => element.entity === 'unit')

                                                    return {
                                                        utterance: {
                                                            ...context.commandTranslator.utterance,
                                                            unitType: unit && unit.value ? unit.value : context.commandTranslator.utterance.unitType,
                                                        },
                                                        translated: {
                                                            ...context.commandTranslator.translated
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
                                        target: 'sayDistance'
                                    },
                                    {
                                        actions: assign(context => ({
                                            commandTranslator: {
                                                ...context.commandTranslator,
                                                utterance: {
                                                    ...context.commandTranslator.utterance,
                                                    unitType: ''
                                                }
                                            },
                                            errorMessage: "Which unit do you mean?"
                                        })),
                                        target: 'errorMessage',
                                    }
                                ]
                            },
                            sayDistance: {
                                entry: say((context) => {
                                    let distance = 0
                                    switch (context.commandTranslator.translated.unitType) {
                                        case units.Archer:
                                            distance = archerContext.moveRange;
                                            break;
                                        case units.Horseman:
                                            distance = horsemanContext.moveRange
                                            break;
                                        case units.Spearman:
                                            distance = spearmanContext.moveRange
                                    }
                                    return `The ${context.commandTranslator.utterance.unitType} can move ${distance} fields.`
                                }),
                                on: {
                                    ENDSPEECH: 'final'
                                }
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
                                    () => 'Do you want to skip this turn?'
                                ])
                            }
                        },
                        on: {
                            YES: 'final',
                            NO: 'fetchMoves'
                        }
                    },
                    approve: {
                        initial: 'checkIfCommandProposed',
                        states: {
                            checkIfCommandProposed: {
                                always: [
                                    {
                                        cond: 'commandProposed',
                                        target: 'execute'
                                    },
                                    {
                                        target: 'final'
                                    }
                                ]
                            },
                            execute: {
                                entry: [
                                    say(context => {
                                        switch (context.proposedCommand!.type) {
                                            case moveType.attack:
                                                return "Ok, we'll attack the unit"
                                            case moveType.move:
                                                return "Ok, we'll move the unit"
                                        }
                                    }),
                                    'executeProposedCommand',
                                ],
                                always: 'final',
                                exit: 'resetProposedCommand'
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
                },
                exit: 'resetProposedCommand'
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
            resetProposedCommand: assign<UserEmpireContext, UserEmpireEvents>({
                proposedCommand: () => undefined
            }),
            executeProposedCommand: send((context: UserEmpireContext) => {
                    let type;
                    switch (context.proposedCommand!.type) {
                        case moveType.attack:
                            type = 'ATTACK';
                            break;
                        case moveType.move:
                            type = 'MOVE'
                    }

                    return {
                        type: type,
                        id: context.proposedCommand!.id,
                        x: context.proposedCommand!.x,
                        y: context.proposedCommand!.y
                    }
                },
                {
                    to: context => context.gameBoard.ref
                }),
            storeProposedCommand: assign<UserEmpireContext, EmpireUnitMoveEvent>({
                proposedCommand: (context, event) => {
                    let attackMoves = event.moves.filter((move) => move.type === moveType.attack)
                    let randomMove;
                    if (attackMoves.length > 0) {
                        randomMove = attackMoves[Math.floor(Math.random() * attackMoves.length)]
                    } else if (event.moves.length > 0) {
                        randomMove = event.moves[Math.floor(Math.random() * event.moves.length)]
                    }

                    if (randomMove) {
                        return {
                            type: randomMove.type,
                            id: context.commandTranslator.translated.id,
                            x: randomMove.location.x,
                            y: randomMove.location.y
                        }
                    } else {
                        return undefined
                    }
                }
            }),
            proposeCommand: say((context) => {
                if (context.proposedCommand) {
                    switch (context.proposedCommand.type) {
                        case moveType.attack:
                            return `We could for example attack the enemy on ${(context.proposedCommand.x + 10).toString(36).toUpperCase()}${context.proposedCommand.y + 1}`
                        case moveType.move:
                            return `We could move it for example to ${(context.proposedCommand.x + 10).toString(36).toUpperCase()}${context.proposedCommand.y + 1}`
                    }
                } else {
                    return "It can't do anything";
                }
            }),
            resetCommandTranslator: assign<UserEmpireContext, UserEmpireEvents>({
                commandTranslator: () => ({
                    utterance: {sourceUnit: '', target: '', unitType: ''},
                    translated: {id: '', x: 0, y: 0, unitType: undefined}
                })
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
            translateTargetField: assign<UserEmpireContext, UserEmpireEvents>({
                commandTranslator: (context) => {
                    let pattern = /([A-Z]+) ?(\d+)/;
                    let regexExec = pattern.exec(context.commandTranslator.utterance.target)!;

                    return {
                        ...context.commandTranslator,
                        translated: {
                            ...context.commandTranslator.translated,
                            x: (parseInt(regexExec[1], 36) - 10),
                            y: parseInt(regexExec[2]) - 1
                        }
                    }
                }
            }),
            translateUnitType: assign<UserEmpireContext, UserEmpireEvents>({
                commandTranslator: (context) => {
                    return {
                        ...context.commandTranslator,
                        translated: {
                            ...context.commandTranslator.translated,
                            unitType: getUnitByString(context.commandTranslator.utterance.unitType)!
                        }
                    }
                }
            }),
            translateSourceUnit: assign<UserEmpireContext, UserEmpireEvents>({
                commandTranslator: context => {
                    let unit_type: units = getUnitByString(context.commandTranslator.utterance.sourceUnit)!

                    if (unit_type) {
                        let unit = context.moves.units.find(unit => unit.type === unit_type);
                        if (unit) {
                            return {
                                ...context.commandTranslator,
                                translated: {
                                    ...context.commandTranslator.translated,
                                    id: unit.id
                                }
                            }
                        }
                    }
                    return context.commandTranslator;
                }
            })
        },
        guards: {
            commandProposed: (context) => context.proposedCommand !== undefined,
            movesLeft: (context) => context.moves.units.length > 0 || context.moves.production,
            validateSourceUnit: (context: UserEmpireContext) => {
                let unit_type: units = getUnitByString(context.commandTranslator.utterance.sourceUnit)!

                if (unit_type) {
                    let unit = context.moves.units.find((unit) => unit.type === unit_type);
                    if (unit) {
                        return true
                    }
                }
                return false;
            },
            validateTargetField: (context: UserEmpireContext) => {
                let pattern = /([A-Z]+) ?(\d+)/;
                let regexExec = pattern.exec(context.commandTranslator.utterance.target)!;
                console.log(regexExec)
                return regexExec && regexExec[1] !== undefined && regexExec[2] !== undefined
            },
            validateUnitType: (context: UserEmpireContext) => {
                let producable = [units.Archer, units.Spearman, units.Horseman]
                let unitType = getUnitByString(context.commandTranslator.utterance.unitType)

                return (unitType && producable.includes(unitType)) || false
            }
        }
    }
);


function motionStateNode(id: string,
                         sourceUnitPrompt: ((context: UserEmpireContext) => string)[],
                         targetPrompt: ((context: UserEmpireContext) => string)[],
                         sourceError: string,
                         targetError: string): StatesConfig<UserEmpireContext, any, UserEmpireEvents> {
    return {
        fetchInformation: {
            initial: 'getSourceUnit',
            states: {
                hist: {
                    type: 'history'
                },
                getSourceUnit: {
                    ...formFillingPromptMachine(
                        sourceUnitPrompt,
                        (context) => context.commandTranslator.utterance.sourceUnit !== '',
                        'getTarget',
                        `${id}~parseUtterance`)
                },
                getTarget: {
                    ...formFillingPromptMachine(
                        targetPrompt,
                        (context) => context.commandTranslator.utterance.target !== '',
                        'final',
                        `${id}~parseUtterance`)
                },
                final: {
                    type: 'final'
                }
            },
            onDone: 'translateSourceUnit'
        },
        parseUtterance: {
            id: `${id}~parseUtterance`,
            invoke: {
                src: context => nluRequest(context.recResult.utterance),
                onDone: [
                    {
                        cond: (context, event) => event.data['intent']['name'] === 'exit_question',
                        target: 'final'
                    },
                    {
                        actions: assign({
                            commandTranslator: (context, event) => {
                                let unit: rasa_response_entity = event.data['entities'].find((element: rasa_response_entity) => element.entity === 'unit' && element.role === 'source')
                                let target: rasa_response_entity = event.data['entities'].find((element: rasa_response_entity) => element.entity === 'field' && element.role === 'target')

                                return {
                                    utterance: {
                                        ...context.commandTranslator.utterance,
                                        sourceUnit: unit && unit.value ? unit.value.toLowerCase() : context.commandTranslator.utterance.sourceUnit,
                                        target: target && target.value ? target.value : context.commandTranslator.utterance.target
                                    },
                                    translated: {
                                        ...context.commandTranslator.translated
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
                        commandTranslator: {
                            ...context.commandTranslator,
                            utterance: {
                                ...context.commandTranslator.utterance,
                                sourceUnit: ''
                            }
                        },
                        errorMessage: sourceError
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
                    target: 'execute'
                },
                {
                    actions: assign((context) => ({
                        commandTranslator: {
                            ...context.commandTranslator,
                            utterance: {
                                ...context.commandTranslator.utterance,
                                target: ''
                            }
                        },
                        errorMessage: targetError
                    })),
                    target: 'fetchInformation',
                }
            ]
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
    }
}
