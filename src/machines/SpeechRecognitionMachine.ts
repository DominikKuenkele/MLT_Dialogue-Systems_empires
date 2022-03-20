import {Actions, actions, assign, createMachine, forwardTo} from "xstate";
import createSpeechSynthesisPonyfill from 'web-speech-cognitive-services/lib/SpeechServices/TextToSpeech';
import {MachineRef} from "../Util";
import uuid from "uuid-v4";
import {pure, respond} from "xstate/es/actions";
import {units} from "../components/Unit";
import {GameBoardContext} from "./GameBoardMachine";


const {send, cancel} = actions;

const TOKEN_ENDPOINT = 'https://northeurope.api.cognitive.microsoft.com/sts/v1.0/issuetoken';
const REGION = 'northeurope';
const defaultPassivity = 4;
const getAuthorizationToken = () => (
    fetch(new Request(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: {
            'Ocp-Apim-Subscription-Key': process.env.REACT_APP_SUBSCRIPTION_KEY!
        },
    })).then(data => data.text()));


export interface SRMContext {
    asr: SpeechRecognition;
    tts: SpeechSynthesis;
    voice: SpeechSynthesisVoice;
    ttsUtterance: MySpeechSynthesisUtterance;
    recResult: Hypothesis[];
    hapticInput: string;
    nluData: any;
    ttsAgenda: string;
    sessionId: string;
    tdmAll: any;
    tdmUtterance: string;
    tdmPassivity: number;
    tdmActions: any;
    tdmVisualOutputInfo: any;
    tdmExpectedAlternatives: any;
    azureAuthorizationToken: string;
    audioCtx: any;

    listeners: MachineRef[];
}

export type SRMEvents =
    | { type: 'TTS_READY' }
    | { type: 'TTS_ERROR' }
    | { type: 'CLICK' }
    | { type: 'SELECT', value: any }
    | { type: 'SHOW_ALTERNATIVES' }
    | { type: 'STARTSPEECH' }
    | { type: 'RECOGNISED' }
    | { type: 'ASRRESULT', value: Hypothesis[] }
    | { type: 'ENDSPEECH' }
    | { type: 'LISTEN' }
    | { type: 'TIMEOUT' }
    | { type: 'RECSTOP' }
    | { type: 'REPROMPT' }
    | { type: 'SPEAK', value: string }
    | { type: 'REGISTER' };


export const createSpeechRecognitionMachine = createMachine<SRMContext, SRMEvents>({
    id: 'speechRecMachine',
    type: 'parallel',
    entry: assign({
        listeners: [] as MachineRef[]
    }),
    states: {
        registration: {
            on: {
                REGISTER: {
                    actions: [
                        'registerListeners',
                        respond('REGISTERED')
                    ]
                }
            }
        },
        speechRecognition: {
            id: 'speechRec',
            initial: 'setUp',
            states: {
                setUp: {
                    entry: [
                        assign({
                            audioCtx: (_ctx) =>
                                new ((window as any).AudioContext || (window as any).webkitAudioContext)()
                        }),
                        (context) =>
                            navigator.mediaDevices.getUserMedia({audio: true})
                                .then(function (stream) {
                                    context.audioCtx.createMediaStreamSource(stream)
                                })
                    ],
                    always: 'getToken'
                },
                getToken: {
                    invoke: {
                        id: "getAuthorizationToken",
                        src: (_ctx, _evt) => getAuthorizationToken(),
                        onDone: {
                            actions: [
                                assign((_context, event) => {
                                    return {azureAuthorizationToken: event.data}
                                }),
                                'ponyfillASR'],
                            target: 'ponyfillTTS'
                        },
                        onError: {
                            target: 'fail'
                        }
                    }
                },
                ponyfillTTS: {
                    invoke: {
                        id: 'ponyTTS',
                        src: (context, _event) => (callback, _onReceive) => {
                            const ponyfill = createSpeechSynthesisPonyfill({
                                audioContext: context.audioCtx,
                                credentials: {
                                    region: REGION,
                                    authorizationToken: context.azureAuthorizationToken,
                                }
                            });
                            const {speechSynthesis, SpeechSynthesisUtterance} = ponyfill;
                            context.tts = speechSynthesis
                            context.ttsUtterance = SpeechSynthesisUtterance
                            context.tts.addEventListener('voiceschanged', () => {
                                context.tts.cancel()
                                const voices = context.tts.getVoices();
                                let voiceRe = RegExp("en-US", 'u')
                                if (process.env.REACT_APP_TTS_VOICE) {
                                    voiceRe = RegExp(process.env.REACT_APP_TTS_VOICE, 'u')
                                }
                                const voice = voices.find(v => voiceRe.test(v.name))!
                                if (voice) {
                                    context.voice = voice
                                    callback('TTS_READY')
                                } else {
                                    console.error(`TTS_ERROR: Could not get voice for regexp ${voiceRe}`)
                                    callback('TTS_ERROR')
                                }
                            })
                        }
                    },
                    on: {
                        TTS_READY: {
                            target: 'idle',
                            actions: 'forwardToListeners'
                        },
                        TTS_ERROR: 'fail'
                    }
                },
                idle: {
                    on: {
                        LISTEN: 'recognising',
                        SPEAK: {
                            target: 'speaking',
                            actions: assign((_context, event) => {
                                return {ttsAgenda: event.value}
                            })
                        }
                    },
                },
                recognising: {
                    initial: 'noinput',
                    exit: 'recStop',
                    on: {
                        ASRRESULT: {
                            actions: ['recLogResult',
                                assign((_context, event) => {
                                    return {
                                        recResult: event.value
                                    }
                                })],
                            target: '.match'
                        },
                        RECOGNISED: {
                            target: 'idle',
                            actions: 'sendUtteranceToListeners'
                        },
                        SELECT: 'idle',
                        CLICK: '.pause',
                        RECSTOP: 'idle'
                    },
                    states: {
                        noinput: {
                            entry: [
                                'recStart',
                                send(
                                    {type: 'TIMEOUT'},
                                    {
                                        delay: (context) => (1000 * (context.tdmPassivity || defaultPassivity)),
                                        id: 'timeout'
                                    }
                                )],
                            on: {
                                TIMEOUT: {
                                    target: '#speechRec.idle',
                                    actions: 'forwardToListeners'
                                },
                                STARTSPEECH: 'inprogress'
                            },
                            exit: cancel('timeout')
                        },
                        inprogress: {},
                        match: {
                            entry: send('RECOGNISED'),
                        },
                        pause: {
                            entry: 'recStop',
                            on: {CLICK: 'noinput'}
                        }
                    }
                },
                speaking: {
                    entry: 'ttsStart',
                    on: {
                        ENDSPEECH: {
                            target: 'idle',
                            actions: 'forwardToListeners'
                        },
                        SELECT: 'idle',
                        CLICK: {target: 'idle', actions: send('ENDSPEECH')}
                    },
                    exit: 'ttsStop',
                },
                fail: {}
            }
        }
    }
}, {
    actions: {
        forwardToListeners: pure((context: SRMContext) => {
            let actions: Actions<any, any> = [];
            for (let listener of context.listeners) {
                actions.push(forwardTo(() => listener.ref))
            }
            return actions;
        }),
        sendUtteranceToListeners: pure((context: SRMContext) => {
            let actions: Actions<any, any> = [];
            for (let listener of context.listeners) {
                actions.push(send(context => ({
                    type: 'RECOGNISED',
                    value: context.recResult[0]
                }), {
                    to: () => listener.ref
                }))
            }
            return actions;
        }),
        registerListeners: assign({
            listeners: (context, _e, {_event}) => [
                ...context.listeners,
                {
                    id: uuid(),
                    ref: _event.origin
                }
            ]
        })
    }
});
