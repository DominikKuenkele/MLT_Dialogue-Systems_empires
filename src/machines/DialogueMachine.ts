import {Action, Machine, send} from "xstate";
import {speechRecognitionMachine} from "./SpeechRecognitionMachine";

function say(text: (context: DialogueContext) => string): Action<DialogueContext, any> {
    return send((context: DialogueContext) => ({
            type: "SPEAK",
            value: text(context)
        })
    )
}

export const createDialogueMachine = Machine<DialogueContext, any, DialogueEvents>({
    id: 'dm',
    type: 'parallel',
    states: {
        srm: {
            ...speechRecognitionMachine
        },
        dm: {
            initial: 'settingUp',
            states: {
                settingUp: {
                    entry: [
                        send('CLICK')
                    ],
                    on: {
                        TTS_READY: 'getCommand'

                    }
                },
                getCommand: {
                    entry: say(() => 'Hello')
                }
            }
        }

    }
});

