import {Action, assign, Event, EventObject, MachineConfig, send, SendExpr, StatesConfig} from "xstate";
import {UserEmpireContext, UserEmpireEvents} from "./machines/UserEmpireMachine";

const rasaurl = 'http://localhost:5005/model/parse';
export const nluRequest = (text: string) =>
    fetch(new Request(rasaurl, {
        method: 'POST',
        body: `{"text": "${text}"}`
    }))
        .then(data => data.json());

export type rasa_response_entity = {
    entity: string,
    start: number,
    end: number,
    value: string,
    extractor: string,
    role: string
}

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

export function say(text: (context: UserEmpireContext, event: UserEmpireEvents) => string): Action<UserEmpireContext, any> {
    return send((context: UserEmpireContext, event: UserEmpireEvents) => ({
            type: "SPEAK",
            value: text(context, event)
        }), {
            to: context => context.speechRecognitionMachine.ref
        }
    )
}

export function sendToSRM(event: Event<EventObject> | SendExpr<UserEmpireContext, UserEmpireEvents, EventObject>) {
    return send(event, {
        to: (context: UserEmpireContext) => context.speechRecognitionMachine.ref
    })
}

export function getPrompts(prompt: ((context: UserEmpireContext) => string)[]): StatesConfig<UserEmpireContext, any, UserEmpireEvents> {
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

export function formFillingPromptMachine(prompt: ((context: UserEmpireContext) => string)[],
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
            TIMEOUT: {
                target: '.hist',
                actions: send('REPROMPT')
            }
        },
        onDone: target
    }
}

const binaryGrammar = {
    "Yes": ["Yes.", "Of course.", "Sure.", "Yeah.", "Yes please.", "Yep.", "OK.", "Yes, thank you."],
    "No": ["No.", "Nope.", "No no.", "Don't.", "Don't do it.", "No way.", "Not at all."]
};

export function binaryPromptMachine(prompt: ((context: UserEmpireContext) => string)[]): MachineConfig<UserEmpireContext, any, UserEmpireEvents> {
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
                actions: send('REPROMPT')
            }
        }
    };
}


export function abstractPromptMachine(prompt: ((context: UserEmpireContext) => string)[]): MachineConfig<UserEmpireContext, any, UserEmpireEvents> {
    return {
        initial: 'prompt0',
        states: {
            ...getPrompts(prompt)
        }
    }
}
