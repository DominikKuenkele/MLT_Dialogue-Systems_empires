import {actions, assign, Machine} from "xstate";

import createSpeechRecognitionPonyfill from 'web-speech-cognitive-services/lib/SpeechServices/SpeechToText';
import createSpeechSynthesisPonyfill from 'web-speech-cognitive-services/lib/SpeechServices/TextToSpeech';
import {asEffect} from "@xstate/react";


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


const speechRecognitionMachine = Machine<SDSContext, any, SDSEvent>({
    id: 'root',
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
                CLICK: '.pause'
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
                        TIMEOUT: '#root.asrtts.idle',
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
});

export const test = speechRecognitionMachine.withConfig({
    actions: {
        recStart: asEffect((context) => {
            context.asr.start()
            /* console.log('Ready to receive a voice input.'); */
        }),
        recStop: asEffect((context) => {
            context.asr.abort()
            /* console.log('Recognition stopped.'); */
        }),
        ttsStart: asEffect((context) => {
            let content = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" xml:lang="en-US"><voice name="${context.voice.name}">`
            content = content + (process.env.REACT_APP_TTS_LEXICON ? `<lexicon uri="${process.env.REACT_APP_TTS_LEXICON}"/>` : "")
            content = content + `${context.ttsAgenda}</voice></speak>`
            console.debug(content)
            const utterance = new context.ttsUtterance(content);
            console.log("S>", context.ttsAgenda)
            utterance.voice = context.voice
            utterance.onend = () => send('ENDSPEECH')
            context.tts.speak(utterance)
        }),
        ttsStop: asEffect((context) => {
            /* console.log('TTS STOP...'); */
            context.tts.cancel()
        }),
        ponyfillASR: asEffect((context, _event) => {
            const
                {SpeechRecognition}
                    = createSpeechRecognitionPonyfill({
                    audioContext: context.audioCtx,
                    credentials: {
                        region: REGION,
                        authorizationToken: context.azureAuthorizationToken,
                    }
                });
            context.asr = new SpeechRecognition()
            context.asr.lang = process.env.REACT_APP_ASR_LANGUAGE || 'en-US'
            context.asr.continuous = true
            context.asr.interimResults = true
            context.asr.onresult = function (event: any) {
                var result = event.results[0]
                if (result.isFinal) {
                    send({
                        type: "ASRRESULT", value:
                            [{
                                "utterance": result[0].transcript,
                                "confidence": result[0].confidence
                            }]
                    })
                } else {
                    send({type: "STARTSPEECH"});
                }
            }
        }),

        recLogResult: (context: SDSContext) => {
            /* context.recResult = event.recResult; */
            console.log('U>', context.recResult[0]["utterance"], context.recResult[0]["confidence"]);
        },
        logIntent:
            (context: SDSContext) => {
                /* context.nluData = event.data */
                console.log('<< NLU intent: ' + context.nluData.intent.name)
            }
    }
});

