import {actions, assign, MachineConfig} from "xstate";
import createSpeechRecognitionPonyfill from 'web-speech-cognitive-services/lib/SpeechServices/SpeechToText';
import createSpeechSynthesisPonyfill from 'web-speech-cognitive-services/lib/SpeechServices/TextToSpeech';


const {send, cancel} = actions;

const TOKEN_ENDPOINT = 'https://northeurope.api.cognitive.microsoft.com/sts/v1.0/issuetoken';
const REGION = 'northeurope';
const defaultPassivity = 10;
const getAuthorizationToken = () => (
    fetch(new Request(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: {
            'Ocp-Apim-Subscription-Key': process.env.REACT_APP_SUBSCRIPTION_KEY!
        },
    })).then(data => data.text()));


export const speechRecognitionMachine: MachineConfig<DialogueContext, any, DialogueEvents> = {
    id: 'speechRecMachine',
    initial: 'init',
    states: {
        init: {
            on: {
                CLICK: {
                    target: 'getToken',
                    actions: [
                        assign({
                            audioCtx: (_ctx) =>
                                new ((window as any).AudioContext || (window as any).webkitAudioContext)()
                        }),
                        (context) =>
                            navigator.mediaDevices.getUserMedia({audio: true})
                                .then(function (stream) {
                                    context.audioCtx.createMediaStreamSource(stream)
                                })
                    ]
                }
            }
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
                        const voice = voices.find((v: any) => voiceRe.test(v.name))!
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
                TTS_READY: 'idle',
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
                RECOGNISED: 'idle',
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
                        TIMEOUT: '#speechRecMachine.idle',
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
                ENDSPEECH: 'idle',
                SELECT: 'idle',
                CLICK: {target: 'idle', actions: send('ENDSPEECH')}
            },
            exit: 'ttsStop',
        },
        fail: {}
    }
};

