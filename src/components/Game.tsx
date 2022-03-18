import {Status} from "./Status";
import {asEffect, useInterpret, useMachine} from "@xstate/react";
import {gameMachine} from "../machines/GameMachine";
import {assign, spawn} from "xstate";
import uuid from "uuid-v4";
import {createGameBoardMachine} from "../machines/GameBoardMachine";
import {dummyRef} from "../Util";
import {GameBoard} from "./GameBoard";
import createSpeechRecognitionPonyfill from "web-speech-cognitive-services/lib/SpeechServices/SpeechToText";
import {createSpeechRecognitionMachine, SRMContext} from "../machines/SpeechRecognitionMachine";


const createDefaultGameBoard = (x: number, y: number) => {
    const defaultGameBoard = [];
    for (let row = 0; row < y; row++) {
        let gameBoardRow = [];
        for (let col = 0; col < x; col++) {
            let r = row - Math.floor(col / 2);
            gameBoardRow.push({
                hexCoordinate: {
                    q: col,
                    r: r,
                    s: -col - r
                },
                unit: dummyRef
            });
        }
        defaultGameBoard.push(gameBoardRow);
    }
    return defaultGameBoard;
}

export function Game() {
    const number_tiles_x = 15;
    const number_tiles_y = 10;
    const tile_size = 6;

    const REGION = 'northeurope';
    const [speechState, speechSend, speechInterpret] = useMachine(createSpeechRecognitionMachine, {
        devTools: true,
        actions: {
            recStart: asEffect((context: SRMContext) => {
                context.asr.start()
                /* console.log('Ready to receive a voice input.'); */
            }),
            recStop: asEffect((context: SRMContext) => {
                context.asr.abort()
                /* console.log('Recognition stopped.'); */
            }),
            ttsStart: asEffect((context: SRMContext) => {
                let content = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" xml:lang="en-US"><voice name="${context.voice.name}">`
                content = content + (process.env.REACT_APP_TTS_LEXICON ? `<lexicon uri="${process.env.REACT_APP_TTS_LEXICON}"/>` : "")
                content = content + `${context.ttsAgenda}</voice></speak>`
                console.debug(content)
                const utterance = new context.ttsUtterance(content);
                console.log("S>", context.ttsAgenda)
                utterance.voice = context.voice
                utterance.onend = () => speechSend('ENDSPEECH')
                context.tts.speak(utterance)
            }),
            ttsStop: asEffect((context: SRMContext) => {
                /* console.log('TTS STOP...'); */
                context.tts.cancel()
            }),
            ponyfillASR: asEffect((context: SRMContext) => {
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
                    let result = event.results[0]
                    if (result.isFinal) {
                        speechSend({
                            type: "ASRRESULT",
                            value: [{
                                "utterance": result[0].transcript,
                                "confidence": result[0].confidence
                            }]
                        })
                    } else {
                        speechSend({type: "STARTSPEECH"});
                    }
                }
            }),

            recLogResult: (context: SRMContext) => {
                /* context.recResult = event.recResult; */
                console.log('U>', context.recResult[0]["utterance"], context.recResult[0]["confidence"]);
            },
            logIntent:
                (context: SRMContext) => {
                    /* context.nluData = event.data */
                    console.log('<< NLU intent: ' + context.nluData.intent.name)
                }
        }
    })
    const speechMachineRef = {
        id: uuid(),
        ref: speechInterpret
    }
    const [gameState, gameSend] = useMachine(gameMachine(speechMachineRef), {
            devTools: true,
            actions: {
                createGameBoard: assign({
                    gameBoard: () => ({
                        id: uuid(),
                        ref: spawn(createGameBoardMachine({
                            gameBoard: createDefaultGameBoard(number_tiles_x, number_tiles_y)
                        }))
                    })
                })
            }
        }
    );

    return (
        <div className={"app"}>
            {gameState.context.gameBoard.id !== '' ?
                <div>
                    <Status/>
                    <GameBoard numberTilesX={number_tiles_x}
                               numberTileY={number_tiles_y}
                               tileSize={tile_size}
                               gameBoardRef={gameState.context.gameBoard.ref}/>
                </div> :
                <div onClick={() => gameSend({type: 'START'})}>Start Game</div>
            }
        </div>
    )
}
